import "server-only";

import Stripe from "stripe";

/**
 * Stripe access, and the question of whether payments are switched on at all.
 *
 * Deposits are optional in two independent ways, and both must be true before a
 * customer is ever asked for money:
 *
 *   1. the shop has enabled them, with an amount, in /admin/settings
 *   2. this deployment actually has Stripe keys
 *
 * When either is false the booking flow behaves exactly as it did before
 * deposits existed. That matters for a repo someone clones: no keys means a
 * working booking site, not a crash on the last step of the wizard.
 */

let client: Stripe | null | undefined;

/** The Stripe client, or null when this deployment has no keys. */
export function stripeClient(): Stripe | null {
  if (client !== undefined) return client;

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    client = null;
    return client;
  }

  client = new Stripe(key, {
    // Pinned rather than floating: an account-level API upgrade should never
    // silently change the shape of what this code receives.
    apiVersion: "2026-07-29.dahlia",
    appInfo: { name: "Blade & Fade Booking" },
    // A customer is waiting on this request. Fail fast and let them retry
    // rather than holding the page open.
    timeout: 12_000,
    maxNetworkRetries: 1,
  });
  return client;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Test keys are `sk_test_…`, live keys `sk_live_…`.
 *
 * Surfaced in the admin UI so nobody demos with live keys by accident, or
 * wonders why a real card was declined against a test account.
 */
export function stripeMode(): "test" | "live" | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return key.startsWith("sk_live_") ? "live" : "test";
}

/**
 * How long a customer has to finish paying before the slot is released.
 *
 * Pinned to 30 because that is Stripe's *minimum* checkout-session lifetime.
 * A shorter hold would let a session stay payable after we had given the slot
 * away — taking money for an appointment that no longer exists. The webhook
 * still handles that case defensively, but the right fix is not to create the
 * window in the first place.
 */
export const HOLD_MINUTES = 30;
