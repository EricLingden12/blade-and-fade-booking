/**
 * Exercises the pure slot maths in `generateSlots`.
 *
 *   node scripts/__checks__/availability.check.ts
 *
 * No database and no network: every rule that matters (grid, buffer, lead
 * time, leave, split shifts, "any barber" union) is decided in that one
 * function, so driving it directly proves more than a round trip would.
 */

import { fromZonedTime } from "date-fns-tz";

import { generateSlots, type Interval } from "@/lib/slots";

/** The shop's shipped defaults, so these checks assert the documented rules. */
const RULES = {
  slotIntervalMinutes: 15,
  turnaroundMinutes: 10,
  leadTimeMinutes: 30,
};

const DAY = "2026-08-10"; // a Monday
const TZ = "Asia/Dubai";

let failures = 0;

function at(time: string): Date {
  return fromZonedTime(`${DAY}T${time}:00`, TZ);
}

/** Slot start times rendered back as shop-local `HH:MM`, for readable asserts. */
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

function interval(from: string, to: string): Interval {
  return { start: at(from).getTime(), end: at(to).getTime() };
}

const NOBODY = new Map<string, Interval[]>();
// Far enough in the past that the lead-time rule never interferes.
const LONG_AGO = new Date("2026-08-01T00:00:00Z");

// ---------------------------------------------------------------------------
console.log("\n— grid and fit —");

check(
  "45-min service in a 09:00–11:00 shift stops once it no longer fits",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 45,
      shifts: [{ staff_id: "a", start_time: "09:00", end_time: "11:00" }],
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
      rules: RULES,
    }),
  ),
  ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"],
);

check(
  "a shift starting at 09:07 is snapped onto the 15-minute grid",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 30,
      shifts: [{ staff_id: "a", start_time: "09:07", end_time: "10:30" }],
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
      rules: RULES,
    }),
  ),
  ["09:15", "09:30", "09:45", "10:00"],
);

// ---------------------------------------------------------------------------
console.log("\n— turnover buffer —");

// A 10:00–10:30 booking blocks anything within 10 minutes either side, so a
// 30-min service can end by 09:50 or start from 10:40.
check(
  "10-minute buffer is enforced on both sides of a booking",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 30,
      shifts: [{ staff_id: "a", start_time: "09:00", end_time: "12:00" }],
      busyByStaff: new Map([["a", [interval("10:00", "10:30")]]]),
      offByStaff: NOBODY,
      now: LONG_AGO,
      rules: RULES,
    }),
  ),
  ["09:00", "09:15", "10:45", "11:00", "11:15", "11:30"],
);

check(
  "back-to-back bookings leave no gap smaller than the buffer",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 15,
      shifts: [{ staff_id: "a", start_time: "09:00", end_time: "10:00" }],
      busyByStaff: new Map([["a", [interval("09:15", "09:30")]]]),
      offByStaff: NOBODY,
      now: LONG_AGO,
      rules: RULES,
    }),
  ),
  ["09:45"],
);

// ---------------------------------------------------------------------------
console.log("\n— time off —");

check(
  "leave blocks slots with no buffer, but no overlap either",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 30,
      shifts: [{ staff_id: "a", start_time: "09:00", end_time: "12:00" }],
      busyByStaff: NOBODY,
      offByStaff: new Map([["a", [interval("10:00", "11:00")]]]),
      now: LONG_AGO,
      rules: RULES,
    }),
  ),
  ["09:00", "09:15", "09:30", "11:00", "11:15", "11:30"],
);

check(
  "a full-day leave block closes the day entirely",
  generateSlots({
    day: DAY,
    durationMinutes: 30,
    shifts: [{ staff_id: "a", start_time: "09:00", end_time: "18:00" }],
    busyByStaff: NOBODY,
    offByStaff: new Map([["a", [interval("00:00", "23:59")]]]),
    now: LONG_AGO,
    rules: RULES,
  }),
  [],
);

// ---------------------------------------------------------------------------
console.log("\n— minimum lead time —");

check(
  "slots inside the 30-minute lead time are dropped",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 30,
      shifts: [{ staff_id: "a", start_time: "09:00", end_time: "11:00" }],
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      // 09:20 shop time -> earliest bookable is 09:50 -> first grid point 10:00
      now: at("09:20"),
      rules: RULES,
    }),
  ),
  ["10:00", "10:15", "10:30"],
);

check(
  "a day that has already ended offers nothing",
  generateSlots({
    day: DAY,
    durationMinutes: 30,
    shifts: [{ staff_id: "a", start_time: "09:00", end_time: "11:00" }],
    busyByStaff: NOBODY,
    offByStaff: NOBODY,
    now: at("23:00"),
    rules: RULES,
  }),
  [],
);

// ---------------------------------------------------------------------------
console.log("\n— split shifts and multiple barbers —");

check(
  "a split shift produces two windows and no slot spanning the gap",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 60,
      shifts: [
        { staff_id: "a", start_time: "09:00", end_time: "11:00" },
        { staff_id: "a", start_time: "14:00", end_time: "16:00" },
      ],
      busyByStaff: NOBODY,
      offByStaff: NOBODY,
      now: LONG_AGO,
      rules: RULES,
    }),
  ),
  ["09:00", "09:15", "09:30", "09:45", "10:00", "14:00", "14:15", "14:30", "14:45", "15:00"],
);

{
  // "Any available": two barbers, one busy at 09:00. The 09:00 slot must
  // survive with only the free barber attached.
  const slots = generateSlots({
    day: DAY,
    durationMinutes: 30,
    shifts: [
      { staff_id: "a", start_time: "09:00", end_time: "10:00" },
      { staff_id: "b", start_time: "09:00", end_time: "10:00" },
    ],
    busyByStaff: new Map([["a", [interval("09:00", "09:30")]]]),
    offByStaff: NOBODY,
    now: LONG_AGO,
    rules: RULES,
  });

  // Barber a's 09:00–09:30 booking, padded by the buffer, swallows every slot
  // that fits in this shift — so all three survive on b alone.
  check("union across barbers keeps every slot", times(slots), [
    "09:00",
    "09:15",
    "09:30",
  ]);
  check(
    "each slot is offered by the free barber only",
    slots.map((slot) => slot.staffIds),
    [["b"], ["b"], ["b"]],
  );
}

{
  // Both free: the slot must carry both barbers, in the order given.
  const slots = generateSlots({
    day: DAY,
    durationMinutes: 30,
    shifts: [
      { staff_id: "a", start_time: "09:00", end_time: "09:30" },
      { staff_id: "b", start_time: "09:00", end_time: "09:30" },
    ],
    busyByStaff: NOBODY,
    offByStaff: NOBODY,
    now: LONG_AGO,
    rules: RULES,
  });
  check("a slot both barbers can take lists both", slots[0]?.staffIds, [
    "a",
    "b",
  ]);
}

{
  // The same barber listed twice for one minute must not be duplicated.
  const slots = generateSlots({
    day: DAY,
    durationMinutes: 30,
    shifts: [
      { staff_id: "a", start_time: "09:00", end_time: "10:00" },
      { staff_id: "a", start_time: "09:00", end_time: "10:00" },
    ],
    busyByStaff: NOBODY,
    offByStaff: NOBODY,
    now: LONG_AGO,
    rules: RULES,
  });
  check("overlapping duplicate shifts don't duplicate the barber", slots[0]?.staffIds, ["a"]);
}

// ---------------------------------------------------------------------------
console.log("\n— boundaries —");

check(
  "a booking ending exactly at a slot start still blocks it (buffer)",
  times(
    generateSlots({
      day: DAY,
      durationMinutes: 30,
      shifts: [{ staff_id: "a", start_time: "09:00", end_time: "10:30" }],
      busyByStaff: new Map([["a", [interval("09:00", "09:30")]]]),
      offByStaff: NOBODY,
      now: LONG_AGO,
      rules: RULES,
    }),
  ),
  ["09:45", "10:00"],
);

check(
  "a service longer than the shift yields nothing",
  generateSlots({
    day: DAY,
    durationMinutes: 120,
    shifts: [{ staff_id: "a", start_time: "09:00", end_time: "10:00" }],
    busyByStaff: NOBODY,
    offByStaff: NOBODY,
    now: LONG_AGO,
    rules: RULES,
  }),
  [],
);

console.log(
  failures === 0 ? "\nALL PASS\n" : `\n${failures} FAILURE(S)\n`,
);
process.exit(failures === 0 ? 0 : 1);
