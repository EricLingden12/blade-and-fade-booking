import {
  dayOfWeek,
  minutesToWallTime,
  shopWallTime,
  wallTimeToMinutes,
  type DayKey,
} from "@/lib/time";

/**
 * The slot maths — pure, with every database read already done by the caller.
 *
 * Kept separate from `availability.ts` (which is `server-only` and does the
 * I/O) so the rules that actually matter — grid, turnover buffer, lead time,
 * leave, split shifts, the "any barber" union — can be driven directly by
 * `scripts/__checks__/availability.check.ts` without a database.
 *
 * Everything works in *wall-clock minutes* within the shop's day and converts
 * each candidate to an absolute instant at the end. Doing it the other way
 * round — millisecond arithmetic from a UTC anchor — silently drifts across a
 * DST boundary. Dubai has no DST, but this shouldn't depend on that.
 */

export type AvailableSlot = {
  /** ISO instant. */
  startsAt: string;
  /** ISO instant. */
  endsAt: string;
  /** Every barber free for this slot — more than one when "any" is chosen. */
  staffIds: string[];
};

/**
 * Why a time isn't offered.
 *
 * `booked` covers "the chair isn't free", which includes the turnaround gap
 * around a neighbouring appointment — from a customer's side those are the
 * same thing, and distinguishing them would leak the shop's exact schedule.
 */
export type SlotState = "available" | "booked" | "past";

export type SlotView = {
  startsAt: string;
  endsAt: string;
  state: SlotState;
  /** Only populated for available slots; never sent to the browser. */
  staffIds: string[];
};

/**
 * The timing rules that shape every offered slot.
 *
 * Passed in rather than imported so the engine stays pure and the shop can
 * change them without a deploy. Per-service length is not here — that comes
 * from the service row itself.
 */
export type BookingRules = {
  slotIntervalMinutes: number;
  turnaroundMinutes: number;
  leadTimeMinutes: number;
};

/** Half-open `[start, end)` in epoch milliseconds. */
export type Interval = { start: number; end: number };

export type Shift = {
  staff_id: string;
  /** Shop-local wall clock, `HH:MM` or `HH:MM:SS`. */
  start_time: string;
  end_time: string;
};

/**
 * The shop's own opening window for a day, in shop-local wall clock.
 *
 * `null` means the shop is shut that day — either the weekday is switched off
 * or the date falls inside a closure. Nothing is offered, whatever the barbers'
 * rotas say.
 */
export type OpeningWindow = { opens: string; closes: string } | null;

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * Every candidate start time for a day, each labelled available, booked or
 * past — the whole grid, not just what's for sale.
 *
 * A time is only `booked` when *no* eligible barber can take it. With "any
 * barber" chosen, one free chair is enough to keep the slot available.
 */
export function generateSlotGrid({
  day,
  durationMinutes,
  shifts,
  opening,
  busyByStaff,
  offByStaff,
  now,
  rules,
}: {
  day: DayKey;
  durationMinutes: number;
  shifts: Shift[];
  opening?: OpeningWindow;
  busyByStaff: Map<string, Interval[]>;
  offByStaff: Map<string, Interval[]>;
  now: Date;
  rules: BookingRules;
}): SlotView[] {
  if (opening === null) return [];

  const openFrom = opening ? wallTimeToMinutes(opening.opens) : null;
  const openUntil = opening ? wallTimeToMinutes(opening.closes) : null;

  const bufferMs = rules.turnaroundMinutes * 60_000;
  const durationMs = durationMinutes * 60_000;
  const earliest = now.getTime() + rules.leadTimeMinutes * 60_000;

  // start ISO -> the best state any barber can offer for it
  const grid = new Map<string, { state: SlotState; staffIds: string[] }>();

  for (const shift of shifts) {
    const windowStart = Math.max(
      wallTimeToMinutes(shift.start_time),
      openFrom ?? Number.NEGATIVE_INFINITY,
    );
    const windowEnd = Math.min(
      wallTimeToMinutes(shift.end_time),
      openUntil ?? Number.POSITIVE_INFINITY,
    );
    if (windowEnd <= windowStart) continue;

    const busy = busyByStaff.get(shift.staff_id) ?? [];
    const off = offByStaff.get(shift.staff_id) ?? [];
    const firstSlot = roundUpTo(windowStart, rules.slotIntervalMinutes);

    for (
      let minute = firstSlot;
      minute + durationMinutes <= windowEnd;
      minute += rules.slotIntervalMinutes
    ) {
      const startsAt = shopWallTime(day, minutesToWallTime(minute));
      const start = startsAt.getTime();
      const end = start + durationMs;
      const iso = startsAt.toISOString();

      const padded = { start: start - bufferMs, end: end + bufferMs };
      const taken =
        busy.some((interval) => overlaps(padded, interval)) ||
        off.some((interval) => overlaps({ start, end }, interval));

      const state: SlotState =
        start < earliest ? "past" : taken ? "booked" : "available";

      const existing = grid.get(iso);
      if (!existing) {
        grid.set(iso, {
          state,
          staffIds: state === "available" ? [shift.staff_id] : [],
        });
        continue;
      }

      // One free barber makes the whole slot bookable, so "available" wins.
      if (state === "available") {
        existing.state = "available";
        existing.staffIds.push(shift.staff_id);
      }
    }
  }

  return [...grid.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startsAt, entry]) => ({
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + durationMs).toISOString(),
      state: entry.state,
      staffIds: [...new Set(entry.staffIds)],
    }));
}

/**
 * The bookable subset of the grid.
 *
 * Defined in terms of `generateSlotGrid` so the two can never disagree about
 * what "free" means — the availability the customer sees and the availability
 * the server re-checks at booking time come from the same code path.
 */
export function generateSlots(input: {
  day: DayKey;
  durationMinutes: number;
  shifts: Shift[];
  opening?: OpeningWindow;
  busyByStaff: Map<string, Interval[]>;
  offByStaff: Map<string, Interval[]>;
  now: Date;
  rules: BookingRules;
}): AvailableSlot[] {
  return generateSlotGrid(input)
    .filter((slot) => slot.state === "available")
    .map(({ startsAt, endsAt, staffIds }) => ({ startsAt, endsAt, staffIds }));
}


export type ShopHoursRow = {
  day_of_week: number;
  is_open: boolean;
  opens: string;
  closes: string;
};

/** Inclusive range of shop-local calendar days. */
export type ClosureRow = {
  starts_on: string;
  ends_on: string;
  reason?: string | null;
};

/** Is this calendar day inside a shop-wide closure? */
export function closureFor<T extends ClosureRow>(
  day: DayKey,
  closures: T[],
): T | null {
  // `yyyy-MM-dd` sorts lexicographically the same way it sorts chronologically,
  // so plain string comparison is correct here and avoids constructing dates.
  return (
    closures.find(
      (closure) => closure.starts_on <= day && day <= closure.ends_on,
    ) ?? null
  );
}

/**
 * The shop's opening window for one calendar day, or `null` when it's shut.
 *
 * A closure beats the weekly hours: the shop can be "open on Wednesdays" and
 * still shut on this particular Wednesday because it's a public holiday.
 */
export function openingWindowFor(
  day: DayKey,
  hours: ShopHoursRow[],
  closures: ClosureRow[] = [],
): OpeningWindow {
  if (closureFor(day, closures)) return null;

  const today = hours.find((row) => row.day_of_week === dayOfWeek(day));
  if (!today || !today.is_open) return null;

  return { opens: today.opens, closes: today.closes };
}

/** Group booking/time-off rows into per-barber interval lists. */
export function groupIntervals(
  rows: Array<{ staff_id: string; starts_at: string; ends_at: string }>,
): Map<string, Interval[]> {
  const map = new Map<string, Interval[]>();
  for (const row of rows) {
    const interval = {
      start: new Date(row.starts_at).getTime(),
      end: new Date(row.ends_at).getTime(),
    };
    const list = map.get(row.staff_id);
    if (list) list.push(interval);
    else map.set(row.staff_id, [interval]);
  }
  return map;
}
