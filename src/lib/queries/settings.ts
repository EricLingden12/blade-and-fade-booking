import "server-only";

import { cache } from "react";

import { DEFAULT_LOCATION, type ShopLocation } from "@/lib/location";
import { DEFAULT_CURRENCY } from "@/lib/money";
import {
  BOOKING_BUFFER_MINUTES,
  MAX_ADVANCE_BOOKING_DAYS,
  MIN_LEAD_TIME_MINUTES,
  SLOT_INTERVAL_MINUTES,
} from "@/lib/shop";
import { stripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export type DepositSettings = {
  /** What the shop asked for. Not the same as "a customer will be charged" — */
  /** see `depositRequired()`, which also needs Stripe keys to be present. */
  enabled: boolean;
  amount: number;
};

export type BookingRuleSettings = {
  turnaroundMinutes: number;
  slotIntervalMinutes: number;
  leadTimeMinutes: number;
  maxAdvanceDays: number;
};

export type ShopSettings = {
  currency: string;
  location: ShopLocation;
  deposit: DepositSettings;
  rules: BookingRuleSettings;
};

/** The shipped defaults, used until migration 0006 has run. */
const DEFAULT_RULES: BookingRuleSettings = {
  turnaroundMinutes: BOOKING_BUFFER_MINUTES,
  slotIntervalMinutes: SLOT_INTERVAL_MINUTES,
  leadTimeMinutes: MIN_LEAD_TIME_MINUTES,
  maxAdvanceDays: MAX_ADVANCE_BOOKING_DAYS,
};

const FALLBACK: ShopSettings = {
  currency: DEFAULT_CURRENCY,
  location: DEFAULT_LOCATION,
  // Falling back to "no deposit" is the only safe direction: a settings read
  // that failed must never cause a customer to be charged.
  deposit: { enabled: false, amount: 0 },
  rules: DEFAULT_RULES,
};

/**
 * The shop's single settings row.
 *
 * Wrapped in React's `cache` so one page render issues one query no matter how
 * many components format a price or print the address.
 *
 * Read through the anon client: every field here is on the public site by
 * design. Falls back to compiled-in defaults rather than throwing — a missing
 * settings row should never take down the menu or the footer.
 */
export const getShopSettings = cache(async (): Promise<ShopSettings> => {
  try {
    const supabase = await createClient();
    // `*`, not a column list, on purpose. Naming a column that a migration
    // hasn't added yet makes PostgREST reject the whole query (42703), and this
    // function's fallback would then quietly revert the currency, the address
    // and the map pin to compiled-in defaults across the entire site. With `*`
    // a missing column simply isn't in the response, and only the feature that
    // needs it degrades.
    const { data, error } = await supabase
      .from("shop_settings")
      .select("*")
      .maybeSingle();

    if (error) {
      // Loud on purpose. The previous version failed silently, so a missing
      // migration looked like "the currency setting doesn't work".
      console.error(
        "[settings] shop_settings read failed — falling back to defaults:",
        error.message,
      );
      return FALLBACK;
    }
    if (!data) return FALLBACK;

    // `select("*")` is typed to the current schema, but the row genuinely may
    // be missing columns on a database that predates a migration.
    const row = data as Partial<typeof data>;

    // A settings row with an empty address array would render a blank footer,
    // which is worse than showing the compiled-in address.
    const addressLines = row.address_lines?.filter(Boolean) ?? [];

    return {
      currency: row.currency_code ?? DEFAULT_CURRENCY,
      location: {
        addressLines: addressLines.length
          ? addressLines
          : DEFAULT_LOCATION.addressLines,
        // numeric arrives as a JSON number, but coerce anyway: a driver that
        // hands back a string would otherwise reach the map URL builders.
        latitude: toCoordinate(row.latitude ?? null),
        longitude: toCoordinate(row.longitude ?? null),
        mapUrl: row.map_url ?? null,
        directionsNote: row.directions_note ?? null,
      },
      // These two arrive only once migration 0005 has run. Absent means "no
      // deposit", which is the safe direction: never charge by accident.
      deposit: {
        enabled: Boolean(row.deposit_enabled),
        amount: Number(row.deposit_amount ?? 0),
      },
      rules: {
        turnaroundMinutes:
          row.turnaround_minutes ?? DEFAULT_RULES.turnaroundMinutes,
        slotIntervalMinutes:
          row.slot_interval_minutes ?? DEFAULT_RULES.slotIntervalMinutes,
        leadTimeMinutes: row.lead_time_minutes ?? DEFAULT_RULES.leadTimeMinutes,
        maxAdvanceDays: row.max_advance_days ?? DEFAULT_RULES.maxAdvanceDays,
      },
    };
  } catch {
    return FALLBACK;
  }
});

function toCoordinate(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Convenience reader for the many components that only format prices. */
export const getCurrency = async (): Promise<string> =>
  (await getShopSettings()).currency;

/** Convenience reader for the address, map pin and directions link. */
export const getShopLocation = async (): Promise<ShopLocation> =>
  (await getShopSettings()).location;

/**
 * Will this booking actually ask for money?
 *
 * Both halves must hold: the shop has switched deposits on *with* an amount,
 * and this deployment has Stripe keys. A clone of the repo with no keys takes
 * bookings exactly as it did before deposits existed, rather than failing at
 * the last step of the wizard.
 */
export async function depositRequired(): Promise<{
  required: boolean;
  amount: number;
  currency: string;
}> {
  const { deposit, currency } = await getShopSettings();

  return {
    required: deposit.enabled && deposit.amount > 0 && stripeConfigured(),
    amount: deposit.amount,
    currency,
  };
}
