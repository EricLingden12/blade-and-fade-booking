/**
 * Shop opening hours and calendar closures.
 *
 *   npx tsx scripts/__checks__/hours.check.ts
 *
 * Two rules matter and both are pure, so they're driven directly:
 *
 *   1. `openingWindowFor` — is the shop open on this calendar day, and when?
 *   2. `generateSlots`'s clamp — a barber's shift is trimmed to the shop's
 *      opening window, so a rota that runs past closing stops selling at
 *      closing.
 *
 * The clamp is the one worth guarding. Getting it wrong doesn't throw; it
 * quietly sells appointments for a shut shop.
 */

import { fromZonedTime } from "date-fns-tz";

import {
  closureFor,
  generateSlots,
  openingWindowFor,
  type ClosureRow,
  type Interval,
  type ShopHoursRow,
} from "@/lib/slots";

const MONDAY = "2026-08-10";
const SUNDAY = "2026-08-09";
const TZ = "Asia/Dubai";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`        actual   ${a}`);
    console.log(`        expected ${b}`);
  }
}

function times(slots: Array<{ startsAt: string }>): string[] {
  return slots.map((slot) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(slot.startsAt)),
  );
}

const NOBODY = new Map<string, Interval[]>();
const LONG_AGO = new Date("2026-08-01T00:00:00Z");

/** Open every day 10:00-21:00 unless a test says otherwise. */
function week(overrides: Partial<Record<number, Partial<ShopHoursRow>>> = {}) {
  return Array.from({ length: 7 }, (_, day) => ({
    day_of_week: day,
    is_open: true,
    opens: "10:00",
    closes: "21:00",
    ...(overrides[day] ?? {}),
  }));
}

console.log("\nopeningWindowFor");

check("an open weekday returns its window", openingWindowFor(MONDAY, week()), {
  opens: "10:00",
  closes: "21:00",
});
check(
  "a weekday switched off is shut",
  openingWindowFor(MONDAY, week({ 1: { is_open: false } })),
  null,
);
check(
  "each weekday gets its own hours",
  openingWindowFor(SUNDAY, week({ 0: { opens: "12:00", closes: "18:00" } })),
  { opens: "12:00", closes: "18:00" },
);
check(
  "a missing row is treated as shut rather than guessed at",
  openingWindowFor(MONDAY, week().filter((row) => row.day_of_week !== 1)),
  null,
);
check(
  "a closure beats the weekly hours",
  openingWindowFor(MONDAY, week(), [
    { starts_on: MONDAY, ends_on: MONDAY, reason: "Eid" },
  ]),
  null,
);
check(
  "a multi-day closure covers the days in between",
  openingWindowFor(MONDAY, week(), [
    { starts_on: "2026-08-08", ends_on: "2026-08-12" },
  ]),
  null,
);
check(
  "a closure that ends before the day does not apply",
  openingWindowFor(MONDAY, week(), [
    { starts_on: "2026-08-01", ends_on: "2026-08-09" },
  ]),
  { opens: "10:00", closes: "21:00" },
);
check(
  "a closure that starts after the day does not apply",
  openingWindowFor(MONDAY, week(), [
    { starts_on: "2026-08-11", ends_on: "2026-08-20" },
  ]),
  { opens: "10:00", closes: "21:00" },
);

console.log("\nclosureFor");

const HOLIDAYS: ClosureRow[] = [
  { starts_on: "2026-08-10", ends_on: "2026-08-12", reason: "Refit" },
];
check("first day of the range", closureFor("2026-08-10", HOLIDAYS)?.reason, "Refit");
check("last day of the range", closureFor("2026-08-12", HOLIDAYS)?.reason, "Refit");
check("day before is clear", closureFor("2026-08-09", HOLIDAYS), null);
check("day after is clear", closureFor("2026-08-13", HOLIDAYS), null);
check("no closures at all", closureFor("2026-08-10", []), null);

console.log("\ngenerateSlots — clamped to opening hours");

const SHIFT = [{ staff_id: "a", start_time: "09:00", end_time: "12:00" }];

check(
  "with no opening window the shift is used as-is",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 60,
      shifts: SHIFT,
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00"],
);

check(
  "a later opening time trims the front of the shift",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 60,
      shifts: SHIFT,
      opening: { opens: "10:00", closes: "21:00" },
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  ["10:00", "10:15", "10:30", "10:45", "11:00"],
);

check(
  "an earlier closing time trims the back, leaving room for the service",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 60,
      shifts: SHIFT,
      opening: { opens: "09:00", closes: "11:00" },
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  ["09:00", "09:15", "09:30", "09:45", "10:00"],
);

check(
  "a closed day sells nothing even with a barber rostered",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 60,
      shifts: SHIFT,
      opening: null,
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  [],
);

check(
  "a shift entirely outside opening hours sells nothing",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 30,
      shifts: SHIFT,
      opening: { opens: "14:00", closes: "21:00" },
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  [],
);

check(
  "opening hours wider than the shift change nothing",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 60,
      shifts: SHIFT,
      opening: { opens: "06:00", closes: "23:00" },
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00"],
);

check(
  "the clamp applies per barber, not once across the shop",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 60,
      shifts: [
        { staff_id: "early", start_time: "08:00", end_time: "12:00" },
        { staff_id: "late", start_time: "10:00", end_time: "12:00" },
      ],
      opening: { opens: "09:00", closes: "12:00" },
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00"],
);

check(
  "both barbers are offered once opening hours let them both work",
  generateSlots({
    day: MONDAY,
    durationMinutes: 60,
    shifts: [
      { staff_id: "early", start_time: "08:00", end_time: "12:00" },
      { staff_id: "late", start_time: "10:00", end_time: "12:00" },
    ],
    opening: { opens: "09:00", closes: "12:00" },
    busyByStaff: NOBODY,
    offByStaff: NOBODY,
    now: LONG_AGO,
  }).find(
    (slot) =>
      new Date(slot.startsAt).getTime() ===
      fromZonedTime(`${MONDAY}T10:00:00`, TZ).getTime(),
  )?.staffIds,
  ["early", "late"],
);

check(
  "closing time is a hard edge — a service that would overrun is not offered",
  times(
    generateSlots({
      day: MONDAY,
      durationMinutes: 45,
      shifts: [{ staff_id: "a", start_time: "09:00", end_time: "18:00" }],
      opening: { opens: "09:00", closes: "10:00" },
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
    }),
  ),
  ["09:00", "09:15"],
);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log("\nALL PASS\n");
