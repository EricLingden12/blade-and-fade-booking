import {
  BOOKING_BUFFER_MINUTES,
  MIN_LEAD_TIME_MINUTES,
  SLOT_INTERVAL_MINUTES,
} from "@/lib/shop";
import {
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

/** Half-open `[start, end)` in epoch milliseconds. */
export type Interval = { start: number; end: number };

export type Shift = {
  staff_id: string;
  /** Shop-local wall clock, `HH:MM` or `HH:MM:SS`. */
  start_time: string;
  end_time: string;
};

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function generateSlots({
  day,
  durationMinutes,
  shifts,
  busyByStaff,
  offByStaff,
  now,
}: {
  day: DayKey;
  durationMinutes: number;
  shifts: Shift[];
  /** Non-cancelled bookings, keyed by barber. */
  busyByStaff: Map<string, Interval[]>;
  /** Time-off blocks, keyed by barber. */
  offByStaff: Map<string, Interval[]>;
  now: Date;
}): AvailableSlot[] {
  const bufferMs = BOOKING_BUFFER_MINUTES * 60_000;
  const durationMs = durationMinutes * 60_000;
  const earliest = now.getTime() + MIN_LEAD_TIME_MINUTES * 60_000;

  // start ISO -> barbers free then
  const found = new Map<string, string[]>();

  for (const shift of shifts) {
    const windowStart = wallTimeToMinutes(shift.start_time);
    const windowEnd = wallTimeToMinutes(shift.end_time);
    const busy = busyByStaff.get(shift.staff_id) ?? [];
    const off = offByStaff.get(shift.staff_id) ?? [];

    // Candidates sit on a clean 15-minute grid even if the shift starts at an
    // odd minute, so customers never see 09:07 as an option.
    const firstSlot = roundUpTo(windowStart, SLOT_INTERVAL_MINUTES);

    for (
      let minute = firstSlot;
      minute + durationMinutes <= windowEnd;
      minute += SLOT_INTERVAL_MINUTES
    ) {
      const startsAt = shopWallTime(day, minutesToWallTime(minute));
      const start = startsAt.getTime();
      const end = start + durationMs;

      // Past, or inside the minimum lead time.
      if (start < earliest) continue;

      // Turnover buffer on both sides of every existing appointment.
      const padded = { start: start - bufferMs, end: end + bufferMs };
      if (busy.some((interval) => overlaps(padded, interval))) continue;

      // Time off is hard — no buffer, but no overlap either.
      if (off.some((interval) => overlaps({ start, end }, interval))) continue;

      const iso = startsAt.toISOString();
      const existing = found.get(iso);
      if (existing) existing.push(shift.staff_id);
      else found.set(iso, [shift.staff_id]);
    }
  }

  return [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startsAt, ids]) => ({
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + durationMs).toISOString(),
      // De-duplicate: a split shift can offer the same minute twice.
      staffIds: [...new Set(ids)],
    }));
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
