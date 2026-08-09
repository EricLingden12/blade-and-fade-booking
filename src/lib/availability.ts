import "server-only";

import { MAX_ADVANCE_BOOKING_DAYS } from "@/lib/shop";
import {
  generateSlots,
  groupIntervals,
  type AvailableSlot,
} from "@/lib/slots";
import { createAdminClient } from "@/lib/supabase/server";
import {
  dayOfWeek,
  shiftDayKey,
  shopWallTime,
  todayInShop,
  type DayKey,
} from "@/lib/time";

/**
 * The availability engine's data access.
 *
 * The rules themselves live in `slots.ts`, which is pure and separately
 * checked; this module's whole job is to fetch the right rows and hand them
 * over.
 *
 * Everything here reads through the service-role client on purpose: working
 * hours, time off and other people's bookings are all invisible to the anon
 * role by design, so availability can never be recomputed — or bypassed — from
 * the browser. Callers get start times and nothing else.
 */

export type { AvailableSlot } from "@/lib/slots";

/** Barbers who are active *and* offer this service. */
async function eligibleStaffIds(
  serviceId: string,
  staffId: string | null,
): Promise<string[]> {
  const db = createAdminClient();

  const { data: links, error } = await db
    .from("staff_services")
    .select("staff_id")
    .eq("service_id", serviceId);

  if (error || !links?.length) return [];

  let ids = links.map((link) => link.staff_id);
  // A pinned barber must still actually offer the service.
  if (staffId) ids = ids.filter((id) => id === staffId);
  if (!ids.length) return [];

  const { data: active } = await db
    .from("staff")
    .select("id, sort_order")
    .in("id", ids)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (active ?? []).map((row) => row.id);
}

/**
 * Open start times for one service, on one day, for one barber (or all who
 * offer it). Returns `[]` for every "nothing available" case rather than
 * throwing — a closed day and a fully-booked day are both just empty.
 */
export async function getDayAvailability({
  serviceId,
  staffId = null,
  day,
  now = new Date(),
}: {
  serviceId: string;
  staffId?: string | null;
  day: DayKey;
  now?: Date;
}): Promise<AvailableSlot[]> {
  const db = createAdminClient();

  // Never generate slots outside the bookable window.
  const today = todayInShop(now);
  if (day < today) return [];
  if (day > shiftDayKey(today, MAX_ADVANCE_BOOKING_DAYS)) return [];

  const { data: service } = await db
    .from("services")
    .select("id, duration_minutes, is_active")
    .eq("id", serviceId)
    .maybeSingle();

  if (!service || !service.is_active) return [];

  const staffIds = await eligibleStaffIds(serviceId, staffId);
  if (!staffIds.length) return [];

  const dayStart = shopWallTime(day, "00:00");
  const dayEnd = shopWallTime(shiftDayKey(day, 1), "00:00");

  const [{ data: shifts }, { data: bookings }, { data: timeOff }] =
    await Promise.all([
      db
        .from("working_hours")
        .select("staff_id, start_time, end_time")
        .in("staff_id", staffIds)
        .eq("day_of_week", dayOfWeek(day)),

      // Anything that *touches* the day, including a booking that started the
      // night before and runs past midnight.
      db
        .from("bookings")
        .select("staff_id, starts_at, ends_at")
        .in("staff_id", staffIds)
        .neq("status", "cancelled")
        .lt("starts_at", dayEnd.toISOString())
        .gt("ends_at", dayStart.toISOString()),

      db
        .from("time_off")
        .select("staff_id, starts_at, ends_at")
        .in("staff_id", staffIds)
        .lt("starts_at", dayEnd.toISOString())
        .gt("ends_at", dayStart.toISOString()),
    ]);

  if (!shifts?.length) return [];

  return generateSlots({
    day,
    durationMinutes: service.duration_minutes,
    shifts,
    busyByStaff: groupIntervals(bookings ?? []),
    offByStaff: groupIntervals(timeOff ?? []),
    now,
  });
}

export type BookingCalendar = {
  /** First selectable day (shop-local). */
  minDay: DayKey;
  /** Last selectable day. */
  maxDay: DayKey;
  /** Days in range with no chance of a slot — closed, or everyone on leave. */
  closedDays: DayKey[];
};

/**
 * Which days the calendar should disable.
 *
 * Deliberately cheap: it answers "could this day ever have a slot?" from
 * working hours and time off alone, without generating slots for 60 days. A
 * day that is open but happens to be fully booked stays selectable and shows
 * an empty state — which is the honest thing to show, since a cancellation can
 * reopen it at any moment.
 */
export async function getBookingCalendar({
  serviceId,
  staffId = null,
  now = new Date(),
}: {
  serviceId: string;
  staffId?: string | null;
  now?: Date;
}): Promise<BookingCalendar> {
  const db = createAdminClient();

  const minDay = todayInShop(now);
  const maxDay = shiftDayKey(minDay, MAX_ADVANCE_BOOKING_DAYS);

  const staffIds = await eligibleStaffIds(serviceId, staffId);
  if (!staffIds.length) {
    return { minDay, maxDay, closedDays: allDaysBetween(minDay, maxDay) };
  }

  const rangeStart = shopWallTime(minDay, "00:00");
  const rangeEnd = shopWallTime(shiftDayKey(maxDay, 1), "00:00");

  const [{ data: shifts }, { data: timeOff }] = await Promise.all([
    db
      .from("working_hours")
      .select("staff_id, day_of_week, start_time, end_time")
      .in("staff_id", staffIds),
    db
      .from("time_off")
      .select("staff_id, starts_at, ends_at")
      .in("staff_id", staffIds)
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
  ]);

  const offByStaff = groupIntervals(timeOff ?? []);
  const closedDays: DayKey[] = [];

  for (let day = minDay; day <= maxDay; day = shiftDayKey(day, 1)) {
    const dow = dayOfWeek(day);
    const todaysShifts = (shifts ?? []).filter(
      (shift) => shift.day_of_week === dow,
    );

    const anyWorkable = todaysShifts.some((shift) => {
      const windowStart = shopWallTime(day, shift.start_time).getTime();
      const windowEnd = shopWallTime(day, shift.end_time).getTime();
      const off = offByStaff.get(shift.staff_id) ?? [];
      // Open unless leave swallows the entire shift.
      return !off.some(
        (interval) =>
          interval.start <= windowStart && interval.end >= windowEnd,
      );
    });

    if (!anyWorkable) closedDays.push(day);
  }

  return { minDay, maxDay, closedDays };
}

function allDaysBetween(from: DayKey, to: DayKey): DayKey[] {
  const days: DayKey[] = [];
  for (let day = from; day <= to; day = shiftDayKey(day, 1)) days.push(day);
  return days;
}

/**
 * Chooses which barber gets a booking made against "any available".
 *
 * Picks whoever has the lightest day, so walk-in load spreads across the shop
 * instead of always landing on whoever sorts first. Ties break on the caller's
 * ordering, which is already `sort_order`.
 */
export async function pickLeastBusyStaff(
  candidateIds: string[],
  day: DayKey,
): Promise<string[]> {
  if (candidateIds.length <= 1) return candidateIds;

  const db = createAdminClient();
  const dayStart = shopWallTime(day, "00:00").toISOString();
  const dayEnd = shopWallTime(shiftDayKey(day, 1), "00:00").toISOString();

  const { data } = await db
    .from("bookings")
    .select("staff_id")
    .in("staff_id", candidateIds)
    .neq("status", "cancelled")
    .gte("starts_at", dayStart)
    .lt("starts_at", dayEnd);

  const load = new Map<string, number>(candidateIds.map((id) => [id, 0]));
  for (const row of data ?? []) {
    load.set(row.staff_id, (load.get(row.staff_id) ?? 0) + 1);
  }

  // Stable sort keeps the original (sort_order) sequence for equal loads.
  return [...candidateIds].sort(
    (a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0),
  );
}
