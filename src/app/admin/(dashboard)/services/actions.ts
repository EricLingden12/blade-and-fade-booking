"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

/** Durations must land on the 5-minute grid — the DB check constraint agrees. */
const serviceSchema = z.object({
  name: z.string().trim().min(2, "Give the service a name").max(80),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  durationMinutes: z
    .number()
    .int()
    .min(5, "Minimum 5 minutes")
    .max(480, "That's over 8 hours")
    .refine((value) => value % 5 === 0, "Use multiples of 5 minutes"),
  price: z.number().min(0, "Price can't be negative").max(100000),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export type ServiceInput = z.infer<typeof serviceSchema> & { id?: string };

function toRow(input: z.infer<typeof serviceSchema>) {
  return {
    name: input.name,
    description: input.description?.trim() ? input.description.trim() : null,
    duration_minutes: input.durationMinutes,
    price: input.price,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
}

function revalidate() {
  revalidatePath("/admin/services");
  revalidatePath("/"); // the public menu changes too
  revalidatePath("/book");
}

export async function saveServiceAction(
  input: ServiceInput,
): Promise<ActionResult> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }

  const supabase = await createClient();
  const row = toRow(parsed.data);

  const { error } = input.id
    ? await supabase.from("services").update(row).eq("id", input.id)
    : await supabase.from("services").insert(row);

  if (error) {
    console.error("[admin] saveService:", error.message);
    return { ok: false, message: "Couldn't save that service." };
  }

  revalidate();
  return { ok: true, message: input.id ? "Service updated." : "Service added." };
}

export async function toggleServiceAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return { ok: false, message: "Couldn't update that service." };

  revalidate();
  return {
    ok: true,
    message: isActive ? "Service is bookable again." : "Service hidden.",
  };
}

/**
 * Hard delete, only when nothing references it.
 *
 * `service_id` is ON DELETE RESTRICT, so a service with history cannot be
 * removed — which is correct, since deleting it would rewrite what past
 * customers actually booked. Deactivating is the right move there, and the
 * error message says so.
 */
export async function deleteServiceAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        message:
          "This service has bookings against it. Hide it instead — that keeps your history intact.",
      };
    }
    console.error("[admin] deleteService:", error.message);
    return { ok: false, message: "Couldn't delete that service." };
  }

  revalidate();
  return { ok: true, message: "Service deleted." };
}
