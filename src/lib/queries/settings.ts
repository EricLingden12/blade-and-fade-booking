import "server-only";

import { cache } from "react";

import { DEFAULT_LOCATION, type ShopLocation } from "@/lib/location";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { stripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export type DepositSettings = {
  /** What the shop asked for. Not the same as "a customer will be charged" — */
  /** see `depositRequired()`, which also needs Stripe keys to be present. */
  enabled: boolean;
  amount: number;
};

export type ShopSettings = {
  currency: string;
  location: ShopLocation;
  deposit: DepositSettings;
};

const FALLBACK: ShopSettings = {
  currency: DEFAULT_CURRENCY,
  location: DEFAULT_LOCATION,
  // Falling back to "no deposit" is the only safe direction: a settings read
  // that failed must never cause a customer to be charged.
  deposit: { enabled: false, amount: 0 },
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
    const { data } = await supabase
      .from("shop_settings")
      .select(
        "currency_code, address_lines, latitude, longitude, map_url, directions_note, deposit_enabled, deposit_amount",
      )
      .maybeSingle();

    if (!data) return FALLBACK;

    // A settings row with an empty address array would render a blank footer,
    // which is worse than showing the compiled-in address.
    const addressLines = data.address_lines?.filter(Boolean) ?? [];

    return {
      currency: data.currency_code ?? DEFAULT_CURRENCY,
      location: {
        addressLines: addressLines.length
          ? addressLines
          : DEFAULT_LOCATION.addressLines,
        // numeric arrives as a JSON number, but coerce anyway: a driver that
        // hands back a string would otherwise reach the map URL builders.
        latitude: toCoordinate(data.latitude),
        longitude: toCoordinate(data.longitude),
        mapUrl: data.map_url ?? null,
        directionsNote: data.directions_note ?? null,
      },
      deposit: {
        enabled: Boolean(data.deposit_enabled),
        amount: Number(data.deposit_amount ?? 0),
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
