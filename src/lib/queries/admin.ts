import "server-only";

import type {
  BookingStatus,
  PaymentStatus,
  Service,
  ShopClosure,
  ShopHours,
  Staff,
  TimeOff,
  WorkingHours,
} from "@/lib/database.types";
import { reportQueryError } from "@/lib/queries/report-error";
import { createClient } from "@/lib/supabase/server";
import {
  dayRangeToInstants,
  shiftDayKey,
  startOfWeekDayKey,
  todayInShop,
  type DayKey,
} from "@/lib/time";

/**
 * Admin reads.
 *
 * All of these go through the *authenticated* client, not the service-role one.
 * If a session ever expires mid-request, RLS returns nothing rather than
 * quietly serving the whole shop's data — the failure mode is an empty screen,
 * not a leak.
 */

export type AdminBooking = {
  id: string;
  referenceCode: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  depositAmount: number | null;
  depositCurrency: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string | null;
  createdAt: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDuration: number;
  staffId: string;
  staffName: string;
  staffAvatarUrl: string | null;
};

type JoinedRow = {
  id: string;
  reference_code: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  // Present only once migration 0005 has run.
  payment_status?: PaymentStatus;
  deposit_amount?: number | null;
  deposit_currency?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string | null;
  created_at: string;
  service_id: string;
  staff_id: string;
  services: { name: string; price: number; duration_minutes: number } | null;
  staff: { name: string; avatar_url: string | null } | null;
};

const JOINED_SELECT = `
  *, created_at,
  service_id, staff_id,
  services:service_id ( name, price, duration_minutes ),
  staff:staff_id ( name, avatar_url )
`;

function toAdminBooking(row: JoinedRow): AdminBooking {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    paymentStatus: row.payment_status ?? "not_required",
    depositAmount:
      row.deposit_amount == null ? null : Number(row.deposit_amount),
    depositCurrency: row.deposit_currency ?? null,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notes: row.notes,
    createdAt: row.created_at,
    serviceId: row.service_id,
    serviceName: row.services?.name ?? "—",
    servicePrice: row.services?.price ?? 0,
    serviceDuration: row.services?.duration_minutes ?? 0,
    staffId: row.staff_id,
    staffName: row.staff?.name ?? "—",
    staffAvatarUrl: row.staff?.avatar_url ?? null,
  };
}

/**
 * Strip characters that are structural in a PostgREST `or=` filter.
 *
 * The filter is a comma-separated list wrapped in parentheses, so an
 * unescaped comma in the search term silently splits it into extra conditions
 * and a stray paren makes the whole query fail to parse — searching for
 * "O'Doherty, Liam" would otherwise 400. Quoting has its own escaping rules;
 * dropping the four structural characters is simpler and costs nothing real,
 * since none of them appear in a name, email, phone or reference code.
 */
function sanitiseSearch(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/[,()"\\]/g, " ").trim();
  return cleaned ? cleaned : null;
}

export type BookingFilters = {
  staffId?: string | null;
  status?: BookingStatus | null;
  from?: DayKey | null;
  to?: DayKey | null;
  search?: string | null;
};

export async function listBookings(
  filters: BookingFilters = {},
  limit = 200,
): Promise<AdminBooking[]> {
  const supabase = await createClient();

  let query = supabase
    .from("bookings")
    .select(JOINED_SELECT)
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (filters.staffId) query = query.eq("staff_id", filters.staffId);
  if (filters.status) query = query.eq("status", filters.status);

  if (filters.from || filters.to) {
    const from = filters.from ?? filters.to!;
    const to = filters.to ?? filters.from!;
    const { start, end } = dayRangeToInstants(from, to);
    query = query
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString());
  }

  const search = sanitiseSearch(filters.search);
  if (search) {
    const term = `%${search}%`;
    query = query.or(
      `customer_name.ilike.${term},customer_email.ilike.${term},reference_code.ilike.${term},customer_phone.ilike.${term}`,
    );
  }

  const { data, error } = await query.returns<JoinedRow[]>();
  if (error) {
    reportQueryError("admin bookings", error);
    return [];
  }
  return (data ?? []).map(toAdminBooking);
}

export async function getBooking(id: string): Promise<AdminBooking | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(JOINED_SELECT)
    .eq("id", id)
    .maybeSingle<JoinedRow>();

  if (error || !data) return null;
  return toAdminBooking(data);
}

export type DashboardData = {
  today: DayKey;
  /**
   * The instant this snapshot was taken, ISO. The page renders "still to come"
   * and "in the chair" against this rather than reading the clock again — one
   * request, one `now`, so the stats and the lists can never disagree.
   */
  now: string;
  todaysBookings: AdminBooking[];
  upcoming: AdminBooking[];
  stats: {
    todayCount: number;
    weekCount: number;
    /** Confirmed + completed only — pending money isn't money. */
    weekRevenue: number;
    pendingCount: number;
  };
};

export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const today = todayInShop();
  const weekStart = startOfWeekDayKey(today);
  const weekEnd = shiftDayKey(weekStart, 6);

  const todayRange = dayRangeToInstants(today, today);
  const weekRange = dayRangeToInstants(weekStart, weekEnd);
  const now = new Date().toISOString();


  const [todayResult, weekResult, upcomingResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(JOINED_SELECT)
      .gte("starts_at", todayRange.start.toISOString())
      .lt("starts_at", todayRange.end.toISOString())
      .order("starts_at", { ascending: true })
      .returns<JoinedRow[]>(),

    supabase
      .from("bookings")
      .select("status, starts_at, services:service_id ( price )")
      .gte("starts_at", weekRange.start.toISOString())
      .lt("starts_at", weekRange.end.toISOString())
      .returns<
        Array<{
          status: BookingStatus;
          starts_at: string;
          services: { price: number } | null;
        }>
      >(),

    // Everything still to come, starting after right now.
    supabase
      .from("bookings")
      .select(JOINED_SELECT)
      .gte("starts_at", now)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(12)
      .returns<JoinedRow[]>(),
  ]);

  const todaysBookings = (todayResult.data ?? []).map(toAdminBooking);
  const weekRows = weekResult.data ?? [];

  return {
    today,
    now,
    todaysBookings,
    upcoming: (upcomingResult.data ?? []).map(toAdminBooking),
    stats: {
      todayCount: todaysBookings.filter((b) => b.status !== "cancelled").length,
      weekCount: weekRows.filter((row) => row.status !== "cancelled").length,
      weekRevenue: weekRows
        .filter(
          (row) => row.status === "confirmed" || row.status === "completed",
        )
        .reduce((total, row) => total + (row.services?.price ?? 0), 0),
      pendingCount: weekRows.filter((row) => row.status === "pending").length,
    },
  };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export async function listServices(): Promise<Service[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return data ?? [];
}

export async function listStaff(): Promise<Staff[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return data ?? [];
}

/** `staffId -> serviceId[]`, for the barber editor. */
export async function getStaffServiceMap(): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_services")
    .select("staff_id, service_id");

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    (map[row.staff_id] ??= []).push(row.service_id);
  }
  return map;
}

export async function listWorkingHours(): Promise<WorkingHours[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("working_hours")
    .select("*")
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  return data ?? [];
}

export async function listTimeOff(): Promise<TimeOff[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("time_off")
    .select("*")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  return data ?? [];
}

export async function listShopHours(): Promise<ShopHours[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_hours")
    .select("*")
    .order("day_of_week", { ascending: true });

  if (error) {
    reportQueryError("shop hours", error);
    return [];
  }
  return data ?? [];
}

/**
 * Closures that haven't finished yet, soonest first.
 *
 * Past ones are left in the table but hidden: the admin is planning ahead, and
 * a growing list of expired holidays is noise.
 */
export async function listClosures(): Promise<ShopClosure[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_closures")
    .select("*")
    .gte("ends_on", todayInShop())
    .order("starts_on", { ascending: true });

  if (error) {
    reportQueryError("shop closures", error);
    return [];
  }
  return data ?? [];
}
