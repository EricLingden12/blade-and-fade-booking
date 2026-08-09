import "server-only";

import { cache } from "react";

import type { ShopClosure, ShopHours } from "@/lib/database.types";
import { closureFor, type OpeningWindow } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";
import { dayOfWeek, shiftDayKey, todayInShop, type DayKey } from "@/lib/time";

/**
 * Opening hours and closures for the public site.
 *
 * Read through the anon client — both are public information. Every function
 * falls back to "open on the usual hours" rather than throwing, so a database
 * hiccup can't make the shop look permanently shut.
 *
 * Wrapped in React's `cache`: the footer, the header status and the map card
 * all want the same week, and one render should mean one query.
 */

/** The hours the site advertised before they became editable. */
const FALLBACK_HOURS: ShopHours[] = [
  { day_of_week: 0, is_open: true, opens: "12:00", closes: "18:00" },
  { day_of_week: 1, is_open: true, opens: "10:00", closes: "21:00" },
  { day_of_week: 2, is_open: true, opens: "10:00", closes: "21:00" },
  { day_of_week: 3, is_open: true, opens: "10:00", closes: "21:00" },
  { day_of_week: 4, is_open: true, opens: "10:00", closes: "21:00" },
  { day_of_week: 5, is_open: true, opens: "10:00", closes: "21:00" },
  { day_of_week: 6, is_open: true, opens: "09:00", closes: "21:00" },
].map((row) => ({ ...row, updated_at: "" }));

export const getShopHours = cache(async (): Promise<ShopHours[]> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("shop_hours")
      .select("*")
      .order("day_of_week", { ascending: true });

    // A partial week would render blank days in the footer; treat it as absent.
    return data && data.length === 7 ? data : FALLBACK_HOURS;
  } catch {
    return FALLBACK_HOURS;
  }
});

/**
 * Closures that end today or later, soonest first.
 *
 * Past closures stay in the table as a record but are never shown — nobody
 * needs to be told the shop was shut last Eid.
 */
export const getUpcomingClosures = cache(async (): Promise<ShopClosure[]> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("shop_closures")
      .select("*")
      .gte("ends_on", todayInShop())
      .order("starts_on", { ascending: true });

    return data ?? [];
  } catch {
    return [];
  }
});

/** Closures overlapping the next `days` days — what's worth announcing. */
export async function getClosuresWithin(days = 60): Promise<ShopClosure[]> {
  const horizon = shiftDayKey(todayInShop(), days);
  const closures = await getUpcomingClosures();
  return closures.filter((closure) => closure.starts_on <= horizon);
}

/** The shop's opening window for a specific day, or `null` when shut. */
export async function getOpeningWindow(day: DayKey): Promise<OpeningWindow> {
  const [hours, closures] = await Promise.all([
    getShopHours(),
    getUpcomingClosures(),
  ]);

  if (closureFor(day, closures)) return null;

  const today = hours.find((row) => row.day_of_week === dayOfWeek(day));
  if (!today || !today.is_open) return null;
  return { opens: today.opens, closes: today.closes };
}

/** Today's closure, when there is one — drives the "Closed today" banner. */
export async function getClosureToday(): Promise<ShopClosure | null> {
  return closureFor(todayInShop(), await getUpcomingClosures());
}
