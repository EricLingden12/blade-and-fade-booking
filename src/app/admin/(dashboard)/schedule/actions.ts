"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { shopWallTime } from "@/lib/time";

export type ActionResult = { ok: boolean; message: string };

const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftSchema = z
  .object({
    staffId: z.uuid(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(WALL_TIME, "Use HH:MM"),
    endTime: z.string().regex(WALL_TIME, "Use HH:MM"),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "The finish time has to be after the start time",
    path: ["endTime"],
  });

function revalidate() {
  revalidatePath("/admin/schedule");
  revalidatePath("/book");
}

/** Shop hours and closures also show in the footer, which is on every page. */
function revalidateShopWide() {
  revalidate();
  revalidatePath("/", "layout");
}

export async function addShiftAction(input: {
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}): Promise<ActionResult> {
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the times.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("working_hours").insert({
    staff_id: parsed.data.staffId,
    day_of_week: parsed.data.dayOfWeek,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
  });

  if (error) {
    // working_hours_unique_shift
    if (error.code === "23505") {
      return {
        ok: false,
        message: "There's already a shift starting at that time on that day.",
      };
    }
    console.error("[admin] addShift:", error.message);
    return { ok: false, message: "Couldn't add that shift." };
  }

  revalidate();
  return { ok: true, message: "Shift added." };
}

export async function deleteShiftAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("working_hours").delete().eq("id", id);

  if (error) return { ok: false, message: "Couldn't remove that shift." };

  revalidate();
  return { ok: true, message: "Shift removed." };
}

/**
 * Time off is entered as shop-local dates and times, then converted to
 * instants here — never in the browser, whose clock may be on the other side
 * of the world from Dubai.
 */
const timeOffSchema = z
  .object({
    staffId: z.uuid(),
    startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
    startTime: z.string().regex(WALL_TIME, "Use HH:MM"),
    endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date"),
    endTime: z.string().regex(WALL_TIME, "Use HH:MM"),
    reason: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .refine(
    (value) =>
      `${value.endDay}T${value.endTime}` > `${value.startDay}T${value.startTime}`,
    { message: "The end has to be after the start", path: ["endDay"] },
  );

export async function addTimeOffAction(input: {
  staffId: string;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  reason: string;
}): Promise<ActionResult> {
  const parsed = timeOffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the dates.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("time_off").insert({
    staff_id: parsed.data.staffId,
    starts_at: shopWallTime(
      parsed.data.startDay,
      parsed.data.startTime,
    ).toISOString(),
    ends_at: shopWallTime(parsed.data.endDay, parsed.data.endTime).toISOString(),
    reason: parsed.data.reason?.trim() ? parsed.data.reason.trim() : null,
  });

  if (error) {
    console.error("[admin] addTimeOff:", error.message);
    return { ok: false, message: "Couldn't save that time off." };
  }

  revalidate();
  return { ok: true, message: "Time off booked." };
}

export async function deleteTimeOffAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("time_off").delete().eq("id", id);

  if (error) return { ok: false, message: "Couldn't remove that." };

  revalidate();
  return { ok: true, message: "Time off removed." };
}

/* -------------------------------------------------------------------------- */
/* Shop opening hours                                                         */
/* -------------------------------------------------------------------------- */

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const shopHoursSchema = z
  .array(
    z
      .object({
        dayOfWeek: z.number().int().min(0).max(6),
        isOpen: z.boolean(),
        opens: z.string().regex(WALL_TIME, "Use HH:MM"),
        closes: z.string().regex(WALL_TIME, "Use HH:MM"),
      })
      .refine((value) => value.closes > value.opens, {
        message: "Closing time has to be after opening time",
        path: ["closes"],
      }),
  )
  .length(7, "The week needs all seven days");

/**
 * Saves the whole week at once.
 *
 * A day being closed keeps its times rather than blanking them, so switching a
 * day back on restores the hours that were last used instead of a default.
 */
export async function updateShopHoursAction(
  rows: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    opens: string;
    closes: string;
  }>,
): Promise<ActionResult> {
  const parsed = shopHoursSchema.safeParse(rows);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the times.",
    };
  }

  const supabase = await createClient();

  // No insert privilege on this table by design — the seven rows are seeded and
  // the week must stay complete, so each day is updated in place.
  const results = await Promise.all(
    parsed.data.map((row) =>
      supabase
        .from("shop_hours")
        .update({
          is_open: row.isOpen,
          opens: row.opens,
          closes: row.closes,
        })
        .eq("day_of_week", row.dayOfWeek),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[admin] updateShopHours:", failed.error.message);
    return { ok: false, message: "Couldn't save the opening hours." };
  }

  revalidateShopWide();

  const openDays = parsed.data.filter((row) => row.isOpen).length;
  return {
    ok: true,
    message:
      openDays === 7
        ? "Opening hours saved — open every day."
        : `Opening hours saved — open ${openDays} ${openDays === 1 ? "day" : "days"} a week.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Calendar closures                                                          */
/* -------------------------------------------------------------------------- */

const closureSchema = z
  .object({
    startsOn: z.string().regex(DAY_KEY, "Pick a start date"),
    endsOn: z.string().regex(DAY_KEY, "Pick an end date"),
    reason: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The last day can't be before the first day",
    path: ["endsOn"],
  });

export async function addClosureAction(input: {
  startsOn: string;
  endsOn: string;
  reason: string;
}): Promise<ActionResult> {
  const parsed = closureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the dates.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("shop_closures").insert({
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
    reason: parsed.data.reason?.trim() ? parsed.data.reason.trim() : null,
  });

  if (error) {
    console.error("[admin] addClosure:", error.message);
    return { ok: false, message: "Couldn't save that closure." };
  }

  revalidateShopWide();
  return { ok: true, message: "Closure added. Those days are now unbookable." };
}

export async function deleteClosureAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shop_closures").delete().eq("id", id);

  if (error) return { ok: false, message: "Couldn't remove that closure." };

  revalidateShopWide();
  return { ok: true, message: "Closure removed." };
}
