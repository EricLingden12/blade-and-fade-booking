"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  isShortMapLink,
  MAX_ADDRESS_LINES,
  parseAddressLines,
  parseCoordinates,
} from "@/lib/location";
import { isSupportedCurrency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isSupportedCurrency, "Pick a currency from the list");

export async function updateCurrencyAction(
  code: string,
): Promise<ActionResult> {
  const parsed = currencySchema.safeParse(code);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_settings")
    .update({ currency_code: parsed.data })
    .eq("id", true);

  if (error) {
    console.error("[admin] updateCurrency:", error.message);
    return { ok: false, message: "Couldn't save that currency." };
  }

  // The currency appears on every price, public and admin alike.
  revalidatePath("/", "layout");

  return { ok: true, message: `Prices now show in ${parsed.data}.` };
}

/* -------------------------------------------------------------------------- */
/* Deposits                                                                   */
/* -------------------------------------------------------------------------- */

const depositSchema = z
  .object({
    enabled: z.boolean(),
    amount: z
      .number()
      .nonnegative("A deposit can't be negative")
      .max(99999, "That deposit is too large"),
  })
  .refine((value) => !value.enabled || value.amount > 0, {
    message: "Set an amount, or switch deposits off",
    path: ["amount"],
  });

export async function updateDepositAction(input: {
  enabled: boolean;
  amount: number;
}): Promise<ActionResult> {
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_settings")
    .update({
      deposit_enabled: parsed.data.enabled,
      deposit_amount: parsed.data.amount,
    })
    .eq("id", true);

  if (error) {
    console.error("[admin] updateDeposit:", error.message);
    return { ok: false, message: "Couldn't save the deposit setting." };
  }

  // The deposit shows on the booking wizard and the review step.
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: parsed.data.enabled
      ? "Deposits are on. New bookings will ask for payment."
      : "Deposits are off. Bookings confirm straight away.",
  };
}

/* -------------------------------------------------------------------------- */
/* Location                                                                   */
/* -------------------------------------------------------------------------- */

export type LocationInput = {
  address: string;
  coordinates: string;
  mapUrl: string;
  directionsNote: string;
};

const locationSchema = z.object({
  address: z
    .string()
    .trim()
    .min(1, "Add at least one address line")
    .max(400, "That address is too long")
    .refine(
      (value) => parseAddressLines(value).length > 0,
      "Add at least one address line",
    )
    .refine(
      (value) => parseAddressLines(value).length <= MAX_ADDRESS_LINES,
      `Use at most ${MAX_ADDRESS_LINES} address lines`,
    ),
  coordinates: z.string().trim().max(2000, "That link is too long"),
  mapUrl: z
    .string()
    .trim()
    .max(2000, "That link is too long")
    .refine(
      (value) => value === "" || /^https?:\/\//i.test(value),
      "The directions link must start with http:// or https://",
    ),
  directionsNote: z.string().trim().max(240, "Keep the note under 240 characters"),
});

/**
 * Expand a `maps.app.goo.gl` share link into the full URL that actually
 * contains coordinates.
 *
 * Google's mobile share sheet hands out short links almost exclusively, so
 * without this the paste-a-link flow would fail for most real users. One
 * redirect hop, a hard timeout, and any failure falls through to the "paste the
 * full link" message rather than surfacing a network error.
 */
async function resolveShortLink(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BladeAndFade/1.0)" },
    });
    const location = response.headers.get("location");
    return location && /^https?:\/\//i.test(location) ? location : null;
  } catch {
    return null;
  }
}

export async function updateLocationAction(
  input: LocationInput,
): Promise<ActionResult> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const { address, coordinates, mapUrl, directionsNote } = parsed.data;

  // An empty coordinates box clears the pin; the map section then hides itself
  // rather than pointing at the middle of the ocean.
  let pin: { latitude: number; longitude: number } | null = null;
  if (coordinates) {
    pin = parseCoordinates(coordinates);

    if (!pin && isShortMapLink(coordinates)) {
      const expanded = await resolveShortLink(coordinates);
      if (expanded) pin = parseCoordinates(expanded);
    }

    if (!pin) {
      return {
        ok: false,
        message: isShortMapLink(coordinates)
          ? "Couldn't open that short link. Open it in a browser and paste the full address bar URL instead."
          : "Couldn't find coordinates in that. Paste a Google Maps link, or type latitude, longitude.",
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_settings")
    .update({
      address_lines: parseAddressLines(address),
      latitude: pin?.latitude ?? null,
      longitude: pin?.longitude ?? null,
      map_url: mapUrl || null,
      directions_note: directionsNote || null,
    })
    .eq("id", true);

  if (error) {
    console.error("[admin] updateLocation:", error.message);
    return { ok: false, message: "Couldn't save the location." };
  }

  // The address is in the footer, so it is on every page.
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: pin ? "Location saved." : "Address saved. No map pin set.",
  };
}
