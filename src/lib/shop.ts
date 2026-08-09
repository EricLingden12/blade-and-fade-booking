/**
 * Shop-wide constants.
 *
 * Everything that the availability engine and the UI need to agree on lives
 * here so there is exactly one place to change the rules.
 */

/** IANA timezone the shop physically operates in. All slot maths happens here. */
export const SHOP_TIMEZONE = "Asia/Dubai";

/** Candidate start times are generated on this grid, in minutes. */
export const SLOT_INTERVAL_MINUTES = 15;

/** Turnover/cleanup gap enforced on both sides of every booking, in minutes. */
export const BOOKING_BUFFER_MINUTES = 10;

/** A booking must start at least this far in the future, in minutes. */
export const MIN_LEAD_TIME_MINUTES = 30;

/** How far ahead customers may book, in days. */
export const MAX_ADVANCE_BOOKING_DAYS = 60;

export const SHOP = {
  name: "Blade & Fade",
  fullName: "Blade & Fade Barbershop",
  tagline: "Sharp cuts. No waiting.",
  phone: "+971 4 555 0182",
  email: "hello@bladeandfade.ae",
  instagram: "https://instagram.com",
  // Address, map pin and opening hours are *not* here — they live in the
  // database so the owner can change them from /admin without a deploy. Read
  // them with `getShopLocation()` and `getShopHours()`.
} as const;


export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DAY_NAMES_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** `10:00` -> `10:00 AM`, for advertised hours that are stored as wall clock. */
export function formatWallTime(time: string): string {
  const [hh, mm] = time.split(":").map(Number);
  const period = hh < 12 ? "AM" : "PM";
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  return mm === 0
    ? `${hour} ${period}`
    : `${hour}:${String(mm).padStart(2, "0")} ${period}`;
}

