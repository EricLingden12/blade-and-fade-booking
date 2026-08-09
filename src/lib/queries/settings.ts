import "server-only";

import { cache } from "react";

import { DEFAULT_LOCATION, type ShopLocation } from "@/lib/location";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type ShopSettings = {
  currency: string;
  location: ShopLocation;
};

const FALLBACK: ShopSettings = {
  currency: DEFAULT_CURRENCY,
  location: DEFAULT_LOCATION,
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
        "currency_code, address_lines, latitude, longitude, map_url, directions_note",
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
