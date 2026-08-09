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
