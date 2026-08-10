"use server";

import {
  getBookingCalendar,
  getDayAvailability,
  pickLeastBusyStaff,
  type BookingCalendar,
} from "@/lib/availability";
import { siteUrl } from "@/lib/env";
import { toMinorUnits } from "@/lib/money";
import { depositRequired } from "@/lib/queries/settings";
import { SHOP } from "@/lib/shop";
import { HOLD_MINUTES, stripeClient } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDateTime, toDayKey } from "@/lib/time";
import {
  createBookingSchema,
  fieldErrors,
  slotQuerySchema,
  type CreateBookingInput,
} from "@/lib/validation";

/** Postgres exclusion-constraint violation — the double-booking guard firing. */
const EXCLUSION_VIOLATION = "23P01";

export type SlotsResult =
  | { ok: true; slots: Array<{ startsAt: string; endsAt: string }> }
  | { ok: false; message: string };

/**
 * Availability for one day. The browser never sees which barber is free for a
 * slot — only that the slot exists — so nothing here leaks the shop's book.
 */
export async function fetchSlotsAction(input: {
  serviceId: string;
  staffId: string | null;
  day: string;
}): Promise<SlotsResult> {
  const parsed = slotQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That request didn't look right." };
  }

  try {
    const slots = await getDayAvailability(parsed.data);
    return {
      ok: true,
      slots: slots.map(({ startsAt, endsAt }) => ({ startsAt, endsAt })),
    };
  } catch (error) {
    console.error("[book] fetchSlots:", error);
    return {
      ok: false,
      message: "We couldn't load times just now. Please try again.",
    };
  }
}

/** Which days the date picker should disable, for the current selection. */
export async function fetchCalendarAction(input: {
  serviceId: string;
  staffId: string | null;
}): Promise<BookingCalendar> {
  return getBookingCalendar(input);
}

export type CreateBookingResult =
  /** Booked outright — no deposit was required. */
  | { ok: true; referenceCode: string }
  /** Slot is held; the customer must pay to confirm it. */
  | { ok: true; referenceCode: string; checkoutUrl: string }
  | { ok: false; reason: "validation"; errors: Record<string, string> }
  | { ok: false; reason: "slot_taken"; message: string }
  | { ok: false; reason: "unavailable"; message: string }
  | { ok: false; reason: "error"; message: string };

/**
 * Creates the booking.
 *
 * Three layers of defence, deliberately overlapping:
 *   1. Zod re-validates every field server-side — the client form is a
 *      convenience, not a gate.
 *   2. Availability is *recomputed here* and the requested slot must appear in
 *      it. A crafted request for a closed Sunday or a past time dies here.
 *   3. The database exclusion constraint settles genuine races, which no amount
 *      of checking in step 2 can prevent.
 *
 * With deposits on there is a fourth concern: money. The row is written as
 * `pending` *before* the customer is sent to Stripe, so the exclusion
 * constraint reserves the slot while they type their card details — otherwise
 * someone could pay for a slot that was taken while they paid. `hold_expires_at`
 * gives it back if they wander off, and only the webhook confirms it.
 */
export async function createBookingAction(
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "validation", errors: fieldErrors(parsed.error) };
  }

  const {
    serviceId,
    staffId,
    startsAt,
    customerName,
    customerEmail,
    customerPhone,
    notes,
  } = parsed.data;

  const db = createAdminClient();
  const day = toDayKey(startsAt);

  try {
    // Abandoned checkouts stop holding their slots before we look at the day,
    // so a customer who gave up two minutes ago doesn't block this one.
    await releaseExpiredHolds();

    const deposit = await depositRequired();

    // --- 2. Re-derive availability; trust nothing from the client ----------
    const slots = await getDayAvailability({ serviceId, staffId, day });
    const requested = new Date(startsAt).toISOString();
    const slot = slots.find((candidate) => candidate.startsAt === requested);

    if (!slot) {
      return {
        ok: false,
        reason: "unavailable",
        message:
          "That time isn't available any more. Pick another and we'll get you in.",
      };
    }

    // --- 3. Insert, letting the database arbitrate --------------------------
    // With "any available" there may be several free barbers. Try them in
    // least-busy order: if one gets taken mid-request, the next still works,
    // so a race only fails the customer when the whole slot is genuinely gone.
    const candidates = staffId
      ? [staffId]
      : await pickLeastBusyStaff(slot.staffIds, day);

    for (const candidateId of candidates) {
      const { data, error } = await db
        .from("bookings")
        .insert({
          service_id: serviceId,
          staff_id: candidateId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
          // A deposit booking is not confirmed until the money is.
          status: deposit.required ? "pending" : "confirmed",
          payment_status: deposit.required ? "pending" : "not_required",
          deposit_amount: deposit.required ? deposit.amount : null,
          deposit_currency: deposit.required ? deposit.currency : null,
          hold_expires_at: deposit.required
            ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
            : null,
          notes: notes ?? null,
        })
        .select("id, reference_code")
        .single();

      if (!error && data) {
        if (!deposit.required) {
          return { ok: true, referenceCode: data.reference_code };
        }

        const checkoutUrl = await startCheckout({
          bookingId: data.id,
          referenceCode: data.reference_code,
          amount: deposit.amount,
          currency: deposit.currency,
          customerEmail,
          startsAt: slot.startsAt,
        });

        if (!checkoutUrl) {
          // Stripe wouldn't give us a session. Release the hold immediately
          // rather than leaving a slot reserved for a payment that can never
          // happen — the customer is told to try again, and the slot is free.
          await db
            .from("bookings")
            .update({ status: "cancelled", payment_status: "failed", hold_expires_at: null })
            .eq("id", data.id);

          return {
            ok: false,
            reason: "error",
            message:
              "We couldn't open the payment page. Nothing has been charged — please try again.",
          };
        }

        return { ok: true, referenceCode: data.reference_code, checkoutUrl };
      }

      if (error?.code === EXCLUSION_VIOLATION) {
        continue; // this barber just got booked — try the next
      }

      if (error) {
        console.error("[book] insert failed:", error);
        return {
          ok: false,
          reason: "error",
          message: "Something went wrong saving your booking. Please try again.",
        };
      }
    }

    // Every candidate lost the race.
    return {
      ok: false,
      reason: "slot_taken",
      message:
        "Someone just took that slot. Choose another time and you'll be straight in.",
    };
  } catch (error) {
    console.error("[book] createBooking:", error);
    return {
      ok: false,
      reason: "error",
      message: "Something went wrong on our end. Please try again.",
    };
  }
}

/**
 * Hand a customer a Stripe Checkout page, or null if Stripe won't play.
 *
 * `bookingId` travels in metadata *and* in the client reference so the webhook
 * can find the row without trusting anything in the URL the browser came back
 * on. The success URL is only a redirect for the customer's benefit — it never
 * confirms the booking.
 */
async function startCheckout({
  bookingId,
  referenceCode,
  amount,
  currency,
  customerEmail,
  startsAt,
}: {
  bookingId: string;
  referenceCode: string;
  amount: number;
  currency: string;
  customerEmail: string;
  startsAt: string;
}): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: customerEmail,
        client_reference_id: bookingId,
        metadata: { bookingId, referenceCode },
        payment_intent_data: {
          metadata: { bookingId, referenceCode },
          description: `Deposit — ${SHOP.fullName} — ${referenceCode}`,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: toMinorUnits(amount, currency),
              product_data: {
                name: `Booking deposit — ${formatDateTime(startsAt)}`,
                description:
                  "Held against your appointment and taken off the bill in the shop.",
              },
            },
          },
        ],
        // Matches HOLD_MINUTES so the session cannot outlive the slot reservation.
        expires_at: Math.floor((Date.now() + HOLD_MINUTES * 60_000) / 1000),
        success_url: `${siteUrl()}/book/confirmation?ref=${encodeURIComponent(referenceCode)}`,
        cancel_url: `${siteUrl()}/book?cancelled=${encodeURIComponent(referenceCode)}`,
      },
      {
        // If the customer double-clicks, or the action is retried, Stripe
        // returns the same session instead of charging twice.
        idempotencyKey: `booking-${bookingId}`,
      },
    );

    return session.url ?? null;
  } catch (error) {
    console.error("[book] stripe checkout session failed:", error);
    return null;
  }
}

/**
 * Give back slots whose payment window lapsed.
 *
 * Runs in the database so the sweep is atomic, and never throws: a failure here
 * must not stop someone booking. The worst case is a slot that stays reserved a
 * little longer than intended.
 */
async function releaseExpiredHolds(): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db.rpc("release_expired_holds");
    if (error && error.code !== "PGRST202") {
      console.error("[book] releaseExpiredHolds:", error.message);
    }
  } catch (error) {
    console.error("[book] releaseExpiredHolds threw:", error);
  }
}

/** Customer-initiated cancellation from the reference-code link. */
export async function cancelBookingAction(
  reference: string,
): Promise<{ ok: boolean; message: string }> {
  const code = reference.trim().toUpperCase();
  if (!/^BF-[A-Z0-9]{6}$/.test(code)) {
    return { ok: false, message: "That booking reference isn't valid." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("bookings")
    .select("id, status, starts_at")
    .eq("reference_code", code)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: "We couldn't find that booking." };
  }
  if (data.status === "cancelled") {
    return { ok: true, message: "That booking was already cancelled." };
  }
  if (new Date(data.starts_at).getTime() < Date.now()) {
    return {
      ok: false,
      message:
        "That appointment has already passed. Give the shop a call if you need help.",
    };
  }

  const { error: updateError } = await db
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", data.id);

  if (updateError) {
    console.error("[book] cancel failed:", updateError);
    return { ok: false, message: "We couldn't cancel that. Please call us." };
  }

  return { ok: true, message: "Your booking is cancelled. Hope to see you soon." };
}
