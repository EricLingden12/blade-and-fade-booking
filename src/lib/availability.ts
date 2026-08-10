import "server-only";

import {
  BOOKING_BUFFER_MINUTES,
  MAX_ADVANCE_BOOKING_DAYS,
  MIN_LEAD_TIME_MINUTES,
  SLOT_INTERVAL_MINUTES,
} from "@/lib/shop";
import {
  generateSlotGrid,
  generateSlots,
  groupIntervals,
  openingWindowFor,
  type AvailableSlot,
  type BookingRules,
  type ClosureRow,
  type ShopHoursRow,
  type SlotView,
} from "@/lib/slots";
import { createAdminClient } from "@/lib/supabase/server";
import {
  dayOfWeek,
  minutesToWallTime,
  shiftDayKey,
  shopWallTime,
  todayInShop,
  wallTimeToMinutes,
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

export type { AvailableSlot, SlotView } from "@/lib/slots";

/**
 * The shop's timing rules, or the compiled-in defaults.
 *
 * Reads `*` rather than naming columns so a database that predates migration
 * 0006 keeps working on the defaults instead of failing the whole query.
 */
async function bookingRules(): Promise<BookingRules & { maxAdvanceDays: number }> {
  const fallback = {
    slotIntervalMinutes: SLOT_INTERVAL_MINUTES,
    turnaroundMinutes: BOOKING_BUFFER_MINUTES,
    leadTimeMinutes: MIN_LEAD_TIME_MINUTES,
    maxAdvanceDays: MAX_ADVANCE_BOOKING_DAYS,
  };

  try {
    const db = createAdminClient();
    const { data } = await db.from("shop_settings").select("*").maybeSingle();
    if (!data) return fallback;

    const row = data as Partial<typeof data>;
    return {
      slotIntervalMinutes: row.slot_interval_minutes ?? fallback.slotIntervalMinutes,
      turnaroundMinutes: row.turnaround_minutes ?? fallback.turnaroundMinutes,
      leadTimeMinutes: row.lead_time_minutes ?? fallback.leadTimeMinutes,
      maxAdvanceDays: row.max_advance_days ?? fallback.maxAdvanceDays,
    };
  } catch {
    return fallback;
  }
}

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
  const rules = await bookingRules();

  // Never generate slots outside the bookable window.
  const today = todayInShop(now);
  if (day < today) return [];
  if (day > shiftDayKey(today, rules.maxAdvanceDays)) return [];

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

  const [
    { data: shifts },
    { data: bookings },
    { data: timeOff },
    { data: shopHours },
    { data: closures },
  ] = await Promise.all([
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

      db.from("shop_hours").select("day_of_week, is_open, opens, closes"),

      // Only closures that cover this specific day.
      db
        .from("shop_closures")
        .select("starts_on, ends_on")
        .lte("starts_on", day)
        .gte("ends_on", day),
    ]);

  if (!shifts?.length) return [];

  return generateSlots({
    day,
    durationMinutes: service.duration_minutes,
    shifts,
    opening: resolveOpening(day, shopHours, closures),
    busyByStaff: groupIntervals(bookings ?? []),
    offByStaff: groupIntervals(timeOff ?? []),
    now,
    rules,
  });
}

/**
 * The full grid for a day — every candidate time, labelled available, booked
 * or past.
 *
 * Same inputs and same code path as `getDayAvailability`; this one just keeps
 * the times it would otherwise drop, so the picker can show a booked slot as
 * booked instead of silently omitting it.
 *
 * `staffIds` is stripped before this leaves the server. Which *chair* is free
 * is the shop's business; that a time is taken is the customer's.
 */
export async function getDaySlotGrid({
  serviceId,
  staffId = null,
  day,
  now = new Date(),
}: {
  serviceId: string;
  staffId?: string | null;
  day: DayKey;
  now?: Date;
}): Promise<SlotView[]> {
  const db = createAdminClient();
  const rules = await bookingRules();

  const today = todayInShop(now);
  if (day < today) return [];
  if (day > shiftDayKey(today, rules.maxAdvanceDays)) return [];

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

  const [
    { data: shifts },
    { data: bookings },
    { data: timeOff },
    { data: shopHours },
    { data: closures },
  ] = await Promise.all([
    db
      .from("working_hours")
      .select("staff_id, start_time, end_time")
      .in("staff_id", staffIds)
      .eq("day_of_week", dayOfWeek(day)),
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
    db.from("shop_hours").select("day_of_week, is_open, opens, closes"),
    db
      .from("shop_closures")
      .select("starts_on, ends_on")
      .lte("starts_on", day)
      .gte("ends_on", day),
  ]);

  if (!shifts?.length) return [];

  return generateSlotGrid({
    day,
    durationMinutes: service.duration_minutes,
    shifts,
    opening: resolveOpening(day, shopHours, closures),
    busyByStaff: groupIntervals(bookings ?? []),
    offByStaff: groupIntervals(timeOff ?? []),
    now,
    rules,
  });
}

/**
 * Opening hours for a day, tolerating a missing `shop_hours` table.
 *
 * Returning `undefined` skips the clamp entirely rather than closing the shop,
 * so a database that hasn't run the migration yet keeps selling slots off the
 * barbers' rotas instead of silently going dark.
 */
function resolveOpening(
  day: DayKey,
  shopHours: ShopHoursRow[] | null,
  closures: ClosureRow[] | null,
) {
  if (!shopHours?.length) return undefined;
  return openingWindowFor(day, shopHours, closures ?? []);
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

  const rules = await bookingRules();
  const minDay = todayInShop(now);
  const maxDay = shiftDayKey(minDay, rules.maxAdvanceDays);

  const staffIds = await eligibleStaffIds(serviceId, staffId);
  if (!staffIds.length) {
    return { minDay, maxDay, closedDays: allDaysBetween(minDay, maxDay) };
  }

  const rangeStart = shopWallTime(minDay, "00:00");
  const rangeEnd = shopWallTime(shiftDayKey(maxDay, 1), "00:00");

  const [{ data: shifts }, { data: timeOff }, { data: shopHours }, { data: closures }] =
    await Promise.all([
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
      db.from("shop_hours").select("day_of_week, is_open, opens, closes"),
      db
        .from("shop_closures")
        .select("starts_on, ends_on")
        .lte("starts_on", maxDay)
        .gte("ends_on", minDay),
    ]);

  const offByStaff = groupIntervals(timeOff ?? []);
  const closedDays: DayKey[] = [];

  for (let day = minDay; day <= maxDay; day = shiftDayKey(day, 1)) {
    const opening = resolveOpening(day, shopHours, closures);

    // Shop shut for the day — no barber's rota can override that.
    if (opening === null) {
      closedDays.push(day);
      continue;
    }

    const dow = dayOfWeek(day);
    const todaysShifts = (shifts ?? []).filter(
      (shift) => shift.day_of_week === dow,
    );

    const anyWorkable = todaysShifts.some((shift) => {
      // Clamp to opening hours before asking whether any of the shift survives,
      // so a rota that sits entirely outside opening hours reads as closed.
      // Compared in minutes, not as strings: Postgres hands back `10:00:00`
      // while a form submits `10:00`, and those don't sort against each other.
      const startMinutes = Math.max(
        wallTimeToMinutes(shift.start_time),
        opening ? wallTimeToMinutes(opening.opens) : Number.NEGATIVE_INFINITY,
      );
      const endMinutes = Math.min(
        wallTimeToMinutes(shift.end_time),
        opening ? wallTimeToMinutes(opening.closes) : Number.POSITIVE_INFINITY,
      );
      if (endMinutes <= startMinutes) return false;

      const windowStart = shopWallTime(
        day,
        minutesToWallTime(startMinutes),
      ).getTime();
      const windowEnd = shopWallTime(
        day,
        minutesToWallTime(endMinutes),
      ).getTime();

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
