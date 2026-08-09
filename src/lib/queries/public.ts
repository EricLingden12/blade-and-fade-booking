import "server-only";

import type { Service, Staff } from "@/lib/database.types";
import { reportQueryError } from "@/lib/queries/report-error";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Reads for the public marketing surface.
 *
 * These deliberately go through the *anon* client rather than the service-role
 * one: the RLS policies already restrict them to active rows, so letting the
 * database enforce that is both simpler and a live proof the policies work.
 */

export async function getActiveServices(): Promise<Service[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    reportQueryError("services", error);
    return [];
  }
  return data ?? [];
}

/**
 * Which active barbers offer which service, as `serviceId -> staffId[]`.
 *
 * Goes through the service-role client because `staff_services` is not exposed
 * to anon. Shipping the whole (small) map to the booking wizard up front means
 * the "choose your barber" step filters instantly instead of waiting on a
 * round trip after every service change.
 */
export async function getServiceStaffMap(): Promise<Record<string, string[]>> {
  const db = createAdminClient();

  const [{ data: links, error }, { data: active }] = await Promise.all([
    db.from("staff_services").select("service_id, staff_id"),
    db.from("staff").select("id").eq("is_active", true),
  ]);

  if (error || !links) {
    reportQueryError("service/barber map", error);
    return {};
  }

  const activeIds = new Set((active ?? []).map((row) => row.id));
  const map: Record<string, string[]> = {};

  for (const link of links) {
    if (!activeIds.has(link.staff_id)) continue;
    (map[link.service_id] ??= []).push(link.staff_id);
  }
  return map;
}

export async function getActiveStaff(): Promise<Staff[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    reportQueryError("barbers", error);
    return [];
  }
  return data ?? [];
}
