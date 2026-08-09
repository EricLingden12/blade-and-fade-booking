import "server-only";

import type { BookingStatus } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/server";

/** A booking joined with the names a customer actually cares about. */
export type BookingDetail = {
  id: string;
  referenceCode: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string | null;
  serviceName: string;
  servicePrice: number;
  serviceDuration: number;
  staffName: string;
  staffAvatarUrl: string | null;
  /** Already finished, as of the moment this was read. */
  isPast: boolean;
};

type JoinedRow = {
  id: string;
  reference_code: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string | null;
  services: { name: string; price: number; duration_minutes: number } | null;
  staff: { name: string; avatar_url: string | null } | null;
};

const JOINED_SELECT = `
  id, reference_code, starts_at, ends_at, status,
  customer_name, customer_email, customer_phone, notes,
  services:service_id ( name, price, duration_minutes ),
  staff:staff_id ( name, avatar_url )
`;

function toDetail(row: JoinedRow): BookingDetail {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notes: row.notes,
    serviceName: row.services?.name ?? "Service",
    servicePrice: row.services?.price ?? 0,
    serviceDuration: row.services?.duration_minutes ?? 0,
    staffName: row.staff?.name ?? "Barber",
    staffAvatarUrl: row.staff?.avatar_url ?? null,
    isPast: new Date(row.starts_at).getTime() < Date.now(),
  };
}

/**
 * Look a booking up by its reference code.
 *
 * Runs through the service-role client because anon has no SELECT policy on
 * bookings at all — knowing the code is the entire authorisation, so the lookup
 * is exact-match only and never a prefix or list.
 */
export async function getBookingByReference(
  reference: string,
): Promise<BookingDetail | null> {
  const code = reference.trim().toUpperCase();
  if (!/^BF-[A-Z0-9]{6}$/.test(code)) return null;

  const db = createAdminClient();
  const { data, error } = await db
    .from("bookings")
    .select(JOINED_SELECT)
    .eq("reference_code", code)
    .maybeSingle<JoinedRow>();

  if (error || !data) return null;
  return toDetail(data);
}
