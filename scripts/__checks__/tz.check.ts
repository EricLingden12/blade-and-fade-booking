import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, format, parseISO } from "date-fns";

const TZ = "Asia/Dubai";
let fails = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}: ${actual}${ok ? "" : `  (expected ${expected})`}`);
}

// --- shopWallTime: shop-local wall clock -> UTC instant -------------------
function shopWallTime(day: string, time: string): Date {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time)!;
  return fromZonedTime(`${day}T${m[1]}:${m[2]}:${m[3] ?? "00"}`, TZ);
}
// Dubai is UTC+4 year-round.
eq("09:00 Dubai -> UTC", shopWallTime("2026-08-08", "09:00").toISOString(), "2026-08-08T05:00:00.000Z");
eq("00:00 Dubai -> UTC", shopWallTime("2026-08-08", "00:00").toISOString(), "2026-08-07T20:00:00.000Z");
eq("21:00 Dubai -> UTC", shopWallTime("2026-01-15", "21:00").toISOString(), "2026-01-15T17:00:00.000Z");

// --- toDayKey: instant -> shop calendar date ------------------------------
const toDayKey = (i: string) => formatInTimeZone(i, TZ, "yyyy-MM-dd");
eq("22:00Z is next day in Dubai", toDayKey("2026-08-08T22:00:00Z"), "2026-08-09");
eq("19:59Z is same day in Dubai", toDayKey("2026-08-08T19:59:00Z"), "2026-08-08");
eq("20:00Z rolls over",           toDayKey("2026-08-08T20:00:00Z"), "2026-08-09");

// --- round trip ------------------------------------------------------------
const rt = shopWallTime("2026-12-31", "23:45");
eq("round trip day",  toDayKey(rt.toISOString()), "2026-12-31");
eq("round trip time", formatInTimeZone(rt, TZ, "HH:mm"), "23:45");

// --- dayOfWeek from a day key (must not shift by local tz) ----------------
const dayOfWeek = (d: string) => parseISO(d).getDay();
eq("2026-08-08 is Saturday(6)", dayOfWeek("2026-08-08"), 6);
eq("2026-08-09 is Sunday(0)",   dayOfWeek("2026-08-09"), 0);
eq("2026-01-01 is Thursday(4)", dayOfWeek("2026-01-01"), 4);

// --- shiftDayKey across month/year boundaries ------------------------------
const shiftDayKey = (d: string, n: number) => format(addDays(parseISO(d), n), "yyyy-MM-dd");
eq("shift over year end",  shiftDayKey("2026-12-31", 1), "2027-01-01");
eq("shift over feb (leap)",shiftDayKey("2028-02-28", 1), "2028-02-29");
eq("shift back",           shiftDayKey("2026-03-01", -1), "2026-02-28");

// --- startOfWeek (Monday) --------------------------------------------------
function startOfWeekDayKey(day: string) {
  const wd = parseISO(day).getDay();
  return shiftDayKey(day, -(wd === 0 ? 6 : wd - 1));
}
eq("Sat 8 Aug -> Mon 3 Aug", startOfWeekDayKey("2026-08-08"), "2026-08-03");
eq("Sun 9 Aug -> Mon 3 Aug", startOfWeekDayKey("2026-08-09"), "2026-08-03");
eq("Mon 10 Aug -> itself",   startOfWeekDayKey("2026-08-10"), "2026-08-10");

// --- calendar widget round trip (local Date <-> day key) ------------------
const asShopWallClockDate = (i: string) => toZonedTime(i, TZ);
const dayKeyFromLocalDate = (d: Date) => format(d, "yyyy-MM-dd");
for (const day of ["2026-08-08", "2026-01-01", "2026-12-31"]) {
  eq(`calendar round trip ${day}`, dayKeyFromLocalDate(asShopWallClockDate(`${day}T12:00:00Z`)), day);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
