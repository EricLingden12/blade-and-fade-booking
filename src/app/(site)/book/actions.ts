"use server";

import {
  getBookingCalendar,
  getDayAvailability,
  pickLeastBusyStaff,
  type BookingCalendar,
} from "@/lib/availability";
import { createAdminClient } from "@/lib/supabase/server";
import { toDayKey } from "@/lib/time";
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
  | { ok: true; referenceCode: string }
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
          status: "confirmed",
          notes: notes ?? null,
        })
        .select("reference_code")
        .single();

      if (!error && data) {
        return { ok: true, referenceCode: data.reference_code };
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
