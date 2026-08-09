"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const staffSchema = z.object({
  name: z.string().trim().min(2, "Give the barber a name").max(80),
  bio: z.string().trim().max(600).optional().or(z.literal("")),
  avatarUrl: z
    .union([z.url("That doesn't look like a URL"), z.literal("")])
    .optional(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  serviceIds: z.array(z.uuid()),
});

export type StaffInput = z.infer<typeof staffSchema> & { id?: string };

function revalidate() {
  revalidatePath("/admin/staff");
  revalidatePath("/admin/schedule");
  revalidatePath("/");
  revalidatePath("/book");
}

/**
 * Create or update a barber, and replace their service assignments.
 *
 * The assignment update is delete-then-insert rather than a diff: the set is
 * tiny, and doing it wholesale means the stored rows always match exactly what
 * the form showed, with no chance of a stale row surviving.
 */
export async function saveStaffAction(
  input: StaffInput,
): Promise<ActionResult> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }

  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    bio: parsed.data.bio?.trim() ? parsed.data.bio.trim() : null,
    avatar_url: parsed.data.avatarUrl?.trim()
      ? parsed.data.avatarUrl.trim()
      : null,
    is_active: parsed.data.isActive,
    sort_order: parsed.data.sortOrder,
  };

  let staffId = input.id;

  if (staffId) {
    const { error } = await supabase
      .from("staff")
      .update(row)
      .eq("id", staffId);
    if (error) {
      console.error("[admin] updateStaff:", error.message);
      return { ok: false, message: "Couldn't save that barber." };
    }
  } else {
    const { data, error } = await supabase
      .from("staff")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      console.error("[admin] createStaff:", error?.message);
      return { ok: false, message: "Couldn't add that barber." };
    }
    staffId = data.id;
  }

  const { error: clearError } = await supabase
    .from("staff_services")
    .delete()
    .eq("staff_id", staffId);

  if (clearError) {
    console.error("[admin] clearAssignments:", clearError.message);
    return { ok: false, message: "Saved the barber, but not their services." };
  }

  if (parsed.data.serviceIds.length > 0) {
    const { error: linkError } = await supabase.from("staff_services").insert(
      parsed.data.serviceIds.map((serviceId) => ({
        staff_id: staffId!,
        service_id: serviceId,
      })),
    );
    if (linkError) {
      console.error("[admin] setAssignments:", linkError.message);
      return { ok: false, message: "Saved the barber, but not their services." };
    }
  }

  revalidate();
  return { ok: true, message: input.id ? "Barber updated." : "Barber added." };
}

export async function toggleStaffAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return { ok: false, message: "Couldn't update that barber." };

  revalidate();
  return {
    ok: true,
    message: isActive ? "Barber is bookable again." : "Barber hidden.",
  };
}

export async function deleteStaffAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("staff").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        message:
          "This barber has bookings against them. Hide them instead — that keeps the history.",
      };
    }
    console.error("[admin] deleteStaff:", error.message);
    return { ok: false, message: "Couldn't delete that barber." };
  }

  revalidate();
  return { ok: true, message: "Barber removed." };
}
