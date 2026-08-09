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
  addressLines: ["Unit 4, Al Fahidi Street", "Bur Dubai, Dubai, UAE"],
  mapsUrl: "https://maps.google.com/?q=Al+Fahidi+Street+Dubai",
  instagram: "https://instagram.com",
  /**
   * Advertised shop hours, indexed by day of week (0 = Sunday).
   * `null` means closed.
   *
   * This is the *storefront* promise. Whether a specific chair is bookable at a
   * given moment is decided by `working_hours` in the database — these two can
   * legitimately differ (a barber may start late on a quiet Tuesday).
   */
  openingHours: [
    { opens: "12:00", closes: "18:00" }, // Sunday
    { opens: "10:00", closes: "21:00" },
    { opens: "10:00", closes: "21:00" },
    { opens: "10:00", closes: "21:00" },
    { opens: "10:00", closes: "21:00" },
    { opens: "10:00", closes: "21:00" },
    { opens: "09:00", closes: "21:00" }, // Saturday
  ] as ReadonlyArray<{ opens: string; closes: string } | null>,
} as const;

export const CURRENCY = {
  code: "AED",
  /** Prices are stored as a numeric column; format them the same way everywhere. */
  format(amount: number): string {
    return `AED ${amount.toLocaleString("en-AE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  },
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

/** Advertised hours for a given weekday, or `null` when the shop is shut. */
export function hoursForDay(dayOfWeek: number) {
  return SHOP.openingHours[dayOfWeek] ?? null;
}
