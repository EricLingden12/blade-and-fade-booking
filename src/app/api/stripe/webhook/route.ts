import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/server";
import { stripeClient, webhookSecret } from "@/lib/stripe";

/**
 * Stripe's word on whether money moved.
 *
 * This — not the browser's return trip to /book/confirmation — is what
 * confirms a booking. A customer who pays and immediately closes the tab must
 * still end up with an appointment, and a browser that hits the success URL
 * without paying must not.
 *
 * The raw body is required: the signature is computed over the exact bytes
 * Stripe sent, so parsing first would break verification.
 */

/** Exclusion-constraint violation — the slot was taken while they paid. */
const EXCLUSION_VIOLATION = "23P01";

export async function POST(request: Request) {
  const stripe = stripeClient();
  const secret = webhookSecret();

  if (!stripe || !secret) {
    // Not an error worth retrying: this deployment simply isn't taking money.
    console.warn("[stripe] webhook received but Stripe is not configured");
    return NextResponse.json({ received: true, ignored: true });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const raw = await request.text();
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (error) {
    // An unverified body is either a misconfiguration or someone poking at the
    // endpoint. Either way it must never reach the handlers below.
    console.error("[stripe] signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object, stripe);
        break;

      case "checkout.session.expired":
        await onCheckoutExpired(event.data.object);
        break;

      default:
        // Everything else is noise we've subscribed to but don't act on.
        break;
    }
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a transient database
    // problem — the event is not lost.
    console.error(`[stripe] handler failed for ${event.type}:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Money arrived. Turn the held booking into a real one.
 *
 * Written to be safely repeatable: Stripe retries on any non-2xx, and a
 * duplicate delivery must not double-confirm or double-refund.
 */
async function onCheckoutCompleted(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
) {
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id;
  if (!bookingId) {
    console.error("[stripe] completed session with no bookingId", session.id);
    return;
  }

  // Only treat it as paid when it actually is. A session can complete while
  // the payment is still processing.
  if (session.payment_status !== "paid") return;

  const db = createAdminClient();
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data: booking } = await db
    .from("bookings")
    .select("id, status, payment_status, reference_code")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    console.error("[stripe] paid session for unknown booking", bookingId);
    await refund(stripe, paymentIntent, "booking no longer exists");
    return;
  }

  // Already handled — a replayed delivery.
  if (booking.payment_status === "paid" && booking.status !== "cancelled") return;

  // The happy path: still held, money in, confirm it.
  if (booking.status === "pending") {
    const { error } = await db
      .from("bookings")
      .update({
        status: "confirmed",
        payment_status: "paid",
        stripe_session_id: session.id,
        stripe_payment_intent: paymentIntent,
        hold_expires_at: null,
      })
      .eq("id", bookingId);

    if (error) throw new Error(`confirming ${bookingId}: ${error.message}`);
    return;
  }

  // The awkward path: the hold lapsed before the payment landed. Try to give
  // them the slot anyway — the exclusion constraint decides whether it's still
  // free, which is the only source of truth that can't race.
  if (booking.status === "cancelled") {
    const { error } = await db
      .from("bookings")
      .update({
        status: "confirmed",
        payment_status: "paid",
        stripe_session_id: session.id,
        stripe_payment_intent: paymentIntent,
        hold_expires_at: null,
      })
      .eq("id", bookingId);

    if (!error) {
      console.warn(
        `[stripe] ${booking.reference_code}: hold had lapsed but the slot was still free — reinstated`,
      );
      return;
    }

    if (error.code === EXCLUSION_VIOLATION) {
      // Someone else genuinely has the slot. We hold their money and must not.
      console.error(
        `[stripe] ${booking.reference_code}: paid after the slot was taken — refunding`,
      );
      await refund(stripe, paymentIntent, "slot no longer available");
      await db
        .from("bookings")
        .update({ payment_status: "refunded" })
        .eq("id", bookingId);
      return;
    }

    throw new Error(`reinstating ${bookingId}: ${error.message}`);
  }
}

/** The customer walked away from the checkout. Give the slot back. */
async function onCheckoutExpired(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id;
  if (!bookingId) return;

  const db = createAdminClient();
  const { error } = await db
    .from("bookings")
    .update({
      status: "cancelled",
      payment_status: "failed",
      hold_expires_at: null,
    })
    .eq("id", bookingId)
    // Never touch a booking that has since been paid or confirmed.
    .eq("status", "pending");

  if (error) throw new Error(`expiring ${bookingId}: ${error.message}`);
}

/**
 * Best-effort refund.
 *
 * Never throws: a refund that fails must be shouted about in the logs, not
 * turned into a 500 that makes Stripe redeliver and try to refund again.
 */
async function refund(
  stripe: Stripe,
  paymentIntent: string | null,
  reason: string,
) {
  if (!paymentIntent) {
    console.error(`[stripe] cannot refund (${reason}): no payment intent`);
    return;
  }

  try {
    await stripe.refunds.create(
      { payment_intent: paymentIntent, reason: "requested_by_customer" },
      { idempotencyKey: `refund-${paymentIntent}` },
    );
    console.warn(`[stripe] refunded ${paymentIntent} — ${reason}`);
  } catch (error) {
    console.error(
      `[stripe] REFUND FAILED for ${paymentIntent} (${reason}) — refund this by hand in the Stripe dashboard:`,
      error,
    );
  }
}
