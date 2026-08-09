"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]),
});

export type ActionResult = { ok: boolean; message: string };

/**
 * Change a booking's status.
 *
 * Writes through the authenticated client so RLS is the thing granting the
 * update — a request without a valid admin session touches nothing.
 */
export async function updateBookingStatusAction(input: {
  id: string;
  status: string;
}): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That status isn't valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[admin] updateBookingStatus:", error.message);
    // Re-confirming a cancelled booking can collide with whoever took the slot.
    if (error.code === "23P01") {
      return {
        ok: false,
        message: "That slot has been taken by another booking since.",
      };
    }
    return { ok: false, message: "Couldn't update that booking." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${parsed.data.id}`);

  return { ok: true, message: "Booking updated." };
}
