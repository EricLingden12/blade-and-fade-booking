import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

import { SHOP_TIMEZONE } from "@/lib/shop";

/**
 * Timezone primitives.
 *
 * Two kinds of value flow through this app and they must never be confused:
 *
 *  - an **instant** — an absolute point in time, always a `Date` (UTC inside)
 *    or an ISO string, and always what gets stored in a `timestamptz` column;
 *  - a **day key** — a calendar date in the *shop's* timezone, `yyyy-MM-dd`,
 *    with no time and no offset. This is what a customer means by "Tuesday".
 *
 * Converting between them requires the shop timezone, which is the one thing
 * every function here has in common. Nothing outside this module should call
 * `new Date(...)` on shop-local wall-clock strings.
 */

/** A calendar date in shop time, `yyyy-MM-dd`. */
export type DayKey = string;

/** Wall-clock time of day in shop time, `HH:mm` or `HH:mm:ss`. */
export type WallTime = string;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WALL_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isDayKey(value: string): value is DayKey {
  return DAY_KEY_PATTERN.test(value);
}

/** Today's date in shop time. */
export function todayInShop(now: Date = new Date()): DayKey {
  return formatInTimeZone(now, SHOP_TIMEZONE, "yyyy-MM-dd");
}

/** The shop-local calendar date an instant falls on. */
export function toDayKey(instant: Date | string): DayKey {
  return formatInTimeZone(instant, SHOP_TIMEZONE, "yyyy-MM-dd");
}

/** Shift a day key by whole calendar days. Immune to DST because it never
 *  touches a clock — it only does calendar arithmetic. */
export function shiftDayKey(day: DayKey, days: number): DayKey {
  return format(addDays(parseISO(day), days), "yyyy-MM-dd");
}

/** Day of week for a day key, 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: DayKey): number {
  return parseISO(day).getDay();
}

/**
 * Resolve a shop-local wall-clock time on a given day to an absolute instant.
 * `shopWallTime("2026-08-08", "09:30")` is 09:30 in Dubai, whatever the server's
 * own timezone happens to be.
 */
export function shopWallTime(day: DayKey, time: WallTime): Date {
  const match = WALL_TIME_PATTERN.exec(time);
  if (!match) {
    throw new Error(`Invalid wall time "${time}", expected HH:mm or HH:mm:ss`);
  }
  const [, hh, mm, ss = "00"] = match;
  return fromZonedTime(`${day}T${hh}:${mm}:${ss}`, SHOP_TIMEZONE);
}

/** Minutes since midnight for a wall-clock time. */
export function wallTimeToMinutes(time: WallTime): number {
  const match = WALL_TIME_PATTERN.exec(time);
  if (!match) {
    throw new Error(`Invalid wall time "${time}", expected HH:mm or HH:mm:ss`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Inverse of `wallTimeToMinutes`, clamped to a single day. */
export function minutesToWallTime(minutes: number): WallTime {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Format an instant in shop time. Patterns are date-fns patterns. */
export function formatInShop(instant: Date | string, pattern: string): string {
  return formatInTimeZone(instant, SHOP_TIMEZONE, pattern);
}

/** `9:30 AM` */
export function formatTime(instant: Date | string): string {
  return formatInShop(instant, "h:mm a");
}

/** `Sat, 8 Aug 2026` */
export function formatDate(instant: Date | string): string {
  return formatInShop(instant, "EEE, d MMM yyyy");
}

/** `Saturday, 8 August 2026` */
export function formatDateLong(instant: Date | string): string {
  return formatInShop(instant, "EEEE, d MMMM yyyy");
}

/** `Sat, 8 Aug · 9:30 AM` */
export function formatDateTime(instant: Date | string): string {
  return formatInShop(instant, "EEE, d MMM · h:mm a");
}

/** `9:30 AM – 10:15 AM` */
export function formatTimeRange(
  start: Date | string,
  end: Date | string,
): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/**
 * A `Date` whose *local* fields read as shop wall time. Only for feeding UI
 * widgets (react-day-picker) that reason in the browser's local timezone.
 * Never store or compare these as instants.
 */
export function asShopWallClockDate(instant: Date | string): Date {
  return toZonedTime(instant, SHOP_TIMEZONE);
}

/** The day key of a `Date` produced by a local-time UI widget. */
export function dayKeyFromLocalDate(local: Date): DayKey {
  return format(local, "yyyy-MM-dd");
}

/** The Monday of the week a day key falls in, as a day key. */
export function startOfWeekDayKey(day: DayKey): DayKey {
  const date = parseISO(day);
  const weekday = date.getDay();
  // Sunday (0) belongs to the week that started six days earlier.
  const backtrack = weekday === 0 ? 6 : weekday - 1;
  return shiftDayKey(day, -backtrack);
}

/** Half-open `[start, end)` instants covering whole shop-local days. */
export function dayRangeToInstants(from: DayKey, to: DayKey) {
  return {
    start: shopWallTime(from, "00:00"),
    end: shopWallTime(shiftDayKey(to, 1), "00:00"),
  };
}

/** Duration in minutes between two instants. */
export function minutesBetween(start: Date | string, end: Date | string) {
  const a = typeof start === "string" ? parseISO(start) : start;
  const b = typeof end === "string" ? parseISO(end) : end;
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** `45 min` / `1 hr` / `1 hr 15 min` */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}
