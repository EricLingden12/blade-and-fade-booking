/**
 * Seeds the database with a demoable barbershop.
 *
 *   npm run seed
 *
 * Run `supabase/schema.sql` first. Uses the service-role key, so it bypasses
 * RLS — a local developer tool that must never ship to the browser.
 *
 * Standalone by design: it talks to Supabase over HTTP and duplicates the one
 * constant it needs (the shop timezone) rather than importing from `src/`,
 * which would drag the `@/` path alias into a plain `node` process.
 */

import { createClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// Mirrors SHOP_TIMEZONE / BOOKING_BUFFER_MINUTES in src/lib/shop.ts.
const SHOP_TIMEZONE = "Asia/Dubai";
const BUFFER_MINUTES = 10;

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.example to .env.local and fill it in.",
  );
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Time helpers (shop-local wall clock -> UTC instant)
// ---------------------------------------------------------------------------

function todayInShop(): string {
  return formatInTimeZone(new Date(), SHOP_TIMEZONE, "yyyy-MM-dd");
}

function shiftDay(day: string, days: number): string {
  return format(addDays(new Date(`${day}T00:00:00`), days), "yyyy-MM-dd");
}

/** `at("2026-08-08", "14:30")` -> the UTC instant of 14:30 in Dubai. */
function at(day: string, time: string): Date {
  return fromZonedTime(`${day}T${time}:00`, SHOP_TIMEZONE);
}

function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00`).getDay();
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toWallTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Deterministic PRNG, so reseeding produces the same shop rather than a
 * different one every run — much easier to reason about while developing.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260808);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SERVICES = [
  {
    name: "Classic Cut",
    description:
      "Scissor-over-comb, tapered sides and a clean neckline. Finished with a hot towel.",
    duration_minutes: 30,
    price: 70,
    sort_order: 1,
  },
  {
    name: "Skin Fade",
    description:
      "Bald fade blended from the skin up, shaped to your head and hairline. Our most requested cut.",
    duration_minutes: 45,
    price: 90,
    sort_order: 2,
  },
  {
    name: "Beard Trim & Line-Up",
    description:
      "Shaped, thinned and edged with a straight razor. Beard oil on the way out.",
    duration_minutes: 20,
    price: 50,
    sort_order: 3,
  },
  {
    name: "Cut + Beard",
    description:
      "The full reset — any cut above paired with a full beard sculpt. Book an hour and relax.",
    duration_minutes: 60,
    price: 130,
    sort_order: 4,
  },
  {
    name: "Kids Cut",
    description:
      "Under 12s. Patient hands, cartoons on the mirror, lollipop at the end.",
    duration_minutes: 25,
    price: 55,
    sort_order: 5,
  },
] as const;

type ServiceName = (typeof SERVICES)[number]["name"];

/** `[day_of_week, start, end]`, 0 = Sunday. */
type Shift = [number, string, string];

const BARBERS: Array<{
  name: string;
  bio: string;
  avatar_url: string;
  sort_order: number;
  services: ServiceName[];
  shifts: Shift[];
}> = [
  {
    name: "Marcus Reyes",
    bio: "Head barber and the reason half our regulars drive across town. Twelve years behind the chair, trained in London, obsessive about scissor work and a taper that grows out clean.",
    avatar_url:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=640&h=640&fit=crop&q=80",
    sort_order: 1,
    services: ["Classic Cut", "Skin Fade", "Beard Trim & Line-Up", "Cut + Beard"],
    shifts: [
      [1, "10:00", "19:00"],
      [2, "10:00", "19:00"],
      [3, "10:00", "19:00"],
      [4, "10:00", "19:00"],
      [5, "10:00", "19:00"],
      [6, "09:00", "18:00"],
    ],
  },
  {
    name: "Omar Haddad",
    bio: "Fade specialist with a straight razor habit. If you want the line-up sharp enough to cut glass, Omar is your man. Works late so you don't have to leave the office early.",
    avatar_url:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=640&h=640&fit=crop&q=80",
    sort_order: 2,
    services: ["Skin Fade", "Beard Trim & Line-Up", "Cut + Beard", "Classic Cut"],
    shifts: [
      [0, "12:00", "18:00"],
      [2, "12:00", "21:00"],
      [3, "12:00", "21:00"],
      [4, "12:00", "21:00"],
      [5, "12:00", "21:00"],
      // Split shift — the availability engine must handle multiple windows in
      // one day, so the seed exercises it.
      [6, "09:00", "13:00"],
      [6, "14:00", "21:00"],
    ],
  },
  {
    name: "Danny Whitlock",
    bio: "Fast, friendly, and unbothered by a squirming six-year-old. Danny handles most of our kids' cuts and any texture that needs coaxing rather than forcing.",
    avatar_url:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=640&h=640&fit=crop&q=80",
    sort_order: 3,
    services: ["Classic Cut", "Kids Cut", "Beard Trim & Line-Up"],
    shifts: [
      [1, "10:00", "18:00"],
      [2, "10:00", "18:00"],
      [3, "10:00", "18:00"],
      [4, "10:00", "18:00"],
      [5, "10:00", "18:00"],
      [6, "09:00", "17:00"],
    ],
  },
];

const CUSTOMERS = [
  { name: "Yusuf Rahman", email: "yusuf.rahman@example.com", phone: "+971 50 441 8823" },
  { name: "Tom Beckett", email: "tom.beckett@example.com", phone: "+971 55 902 1147" },
  { name: "Arjun Nair", email: "arjun.nair@example.com", phone: "+971 52 338 7710" },
  { name: "Liam O'Doherty", email: "liam.odoherty@example.com", phone: "+971 56 771 2094" },
  { name: "Hassan Al Mazrouei", email: "hassan.almazrouei@example.com", phone: "+971 50 118 6632" },
  { name: "Peter Nowak", email: "peter.nowak@example.com", phone: "+971 54 220 9985" },
  { name: "Kwame Boateng", email: "kwame.boateng@example.com", phone: "+971 55 604 3318" },
  { name: "Sam Whitfield", email: "sam.whitfield@example.com", phone: "+971 52 887 4406" },
  { name: "Idris Suleiman", email: "idris.suleiman@example.com", phone: "+971 50 663 2277" },
  { name: "Ravi Menon", email: "ravi.menon@example.com", phone: "+971 55 447 1903" },
];

const NOTES = [
  "Keep the length on top.",
  "First visit — found you on Instagram.",
  "Same as last time please.",
  "Running from the office, might be 5 min late.",
  "Two brothers, back to back if possible.",
  null,
  null,
  null,
  null,
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

function fail(step: string, error: { message: string } | null): void {
  if (error) {
    console.error(`✗ ${step}: ${error.message}`);
    process.exit(1);
  }
}

async function wipe() {
  // Bookings first: staff_id and service_id are ON DELETE RESTRICT.
  fail("clear bookings", (await db.from("bookings").delete().not("id", "is", null)).error);
  fail("clear time off", (await db.from("time_off").delete().not("id", "is", null)).error);
  fail("clear working hours", (await db.from("working_hours").delete().not("id", "is", null)).error);
  fail("clear assignments", (await db.from("staff_services").delete().not("staff_id", "is", null)).error);
  fail("clear barbers", (await db.from("staff").delete().not("id", "is", null)).error);
  fail("clear services", (await db.from("services").delete().not("id", "is", null)).error);
  console.log("· cleared existing data");
}

async function seedServices(): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("services")
    .insert(SERVICES.map((s) => ({ ...s, is_active: true })))
    .select("id, name");
  fail("insert services", error);
  console.log(`✓ ${data!.length} services`);
  return new Map(data!.map((row) => [row.name as string, row.id as string]));
}

async function seedStaff(): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("staff")
    .insert(
      BARBERS.map(({ name, bio, avatar_url, sort_order }) => ({
        name,
        bio,
        avatar_url,
        sort_order,
        is_active: true,
      })),
    )
    .select("id, name");
  fail("insert barbers", error);
  console.log(`✓ ${data!.length} barbers`);
  return new Map(data!.map((row) => [row.name as string, row.id as string]));
}

async function seedAssignments(
  staffIds: Map<string, string>,
  serviceIds: Map<string, string>,
) {
  const rows = BARBERS.flatMap((barber) =>
    barber.services.map((service) => ({
      staff_id: staffIds.get(barber.name)!,
      service_id: serviceIds.get(service)!,
    })),
  );
  fail("assign services", (await db.from("staff_services").insert(rows)).error);
  console.log(`✓ ${rows.length} service assignments`);
}

async function seedWorkingHours(staffIds: Map<string, string>) {
  const rows = BARBERS.flatMap((barber) =>
    barber.shifts.map(([day, start, end]) => ({
      staff_id: staffIds.get(barber.name)!,
      day_of_week: day,
      start_time: start,
      end_time: end,
    })),
  );
  fail("insert working hours", (await db.from("working_hours").insert(rows)).error);
  console.log(`✓ ${rows.length} working-hour blocks`);
}

type TimeOffBlock = { barber: string; startsAt: Date; endsAt: Date; reason: string };

type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

type PlannedBooking = {
  barber: string;
  service: ServiceName;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  notes: string | null;
  customer: (typeof CUSTOMERS)[number];
};

function planTimeOff(today: string): TimeOffBlock[] {
  return [
    {
      barber: "Danny Whitlock",
      startsAt: at(shiftDay(today, 5), "00:00"),
      endsAt: at(shiftDay(today, 8), "00:00"),
      reason: "Annual leave",
    },
    {
      barber: "Omar Haddad",
      startsAt: at(shiftDay(today, 3), "12:00"),
      endsAt: at(shiftDay(today, 3), "16:00"),
      reason: "Dentist",
    },
  ];
}

async function seedTimeOff(staffIds: Map<string, string>, blocks: TimeOffBlock[]) {
  const rows = blocks.map((block) => ({
    staff_id: staffIds.get(block.barber)!,
    starts_at: block.startsAt.toISOString(),
    ends_at: block.endsAt.toISOString(),
    reason: block.reason,
  }));
  fail("insert time off", (await db.from("time_off").insert(rows)).error);
  console.log(`✓ ${rows.length} time-off blocks`);
}

/**
 * Walks each barber's real shifts across a two-week window and drops bookings
 * inside them.
 *
 * Generating against the schedule rather than hardcoding times means the seed
 * is always internally consistent: no booking lands on a day off, inside a
 * time-off block, or overlapping another — which would trip the exclusion
 * constraint and look like a bug in the dashboard.
 *
 * Density is deliberately light (~40% of shifts get any booking at all) so the
 * booking flow still has plenty of open slots to demo.
 */
function planBookings(today: string, timeOff: TimeOffBlock[]): PlannedBooking[] {
  const durations = new Map<string, number>(
    SERVICES.map((s) => [s.name, s.duration_minutes]),
  );
  const planned: PlannedBooking[] = [];
  let customerIndex = 0;

  for (let offset = -4; offset <= 10; offset++) {
    const day = shiftDay(today, offset);
    const dow = dayOfWeek(day);
    const isPast = offset < 0;

    for (const barber of BARBERS) {
      const shifts = barber.shifts.filter(([shiftDow]) => shiftDow === dow);

      for (const [, start, end] of shifts) {
        if (random() > 0.55) continue; // most shifts stay quiet

        const shiftEnd = toMinutes(end);
        // Start somewhere in the first couple of hours, on the 15-min grid.
        let cursor = toMinutes(start) + Math.floor(random() * 8) * 15;
        const maxPerShift = 1 + Math.floor(random() * 3);
        let placed = 0;

        while (placed < maxPerShift) {
          const service = pick(barber.services);
          const duration = durations.get(service)!;
          if (cursor + duration > shiftEnd) break;

          const startsAt = at(day, toWallTime(cursor));
          const endsAt = new Date(startsAt.getTime() + duration * 60_000);

          const clashesWithLeave = timeOff.some(
            (block) =>
              block.barber === barber.name &&
              startsAt < block.endsAt &&
              endsAt > block.startsAt,
          );

          if (!clashesWithLeave) {
            const roll = random();
            const status = isPast
              ? roll < 0.85
                ? ("completed" as const)
                : roll < 0.95
                  ? ("no_show" as const)
                  : ("cancelled" as const)
              : roll < 0.75
                ? ("confirmed" as const)
                : roll < 0.92
                  ? ("pending" as const)
                  : ("cancelled" as const);

            planned.push({
              barber: barber.name,
              service,
              startsAt,
              endsAt,
              status,
              notes: pick(NOTES),
              customer: CUSTOMERS[customerIndex++ % CUSTOMERS.length],
            });
            placed++;
          }

          // Next appointment: duration + turnover buffer + an idle gap, snapped
          // back onto the 15-minute grid.
          cursor += duration + BUFFER_MINUTES + Math.floor(random() * 5) * 15;
          cursor = Math.ceil(cursor / 15) * 15;
        }
      }
    }
  }

  return planned;
}

async function seedBookings(
  staffIds: Map<string, string>,
  serviceIds: Map<string, string>,
  today: string,
  timeOff: TimeOffBlock[],
) {
  const planned = planBookings(today, timeOff);

  const rows = planned.map((entry) => ({
    service_id: serviceIds.get(entry.service)!,
    staff_id: staffIds.get(entry.barber)!,
    customer_name: entry.customer.name,
    customer_email: entry.customer.email,
    customer_phone: entry.customer.phone,
    starts_at: entry.startsAt.toISOString(),
    ends_at: entry.endsAt.toISOString(),
    status: entry.status,
    notes: entry.notes,
  }));

  const { data, error } = await db.from("bookings").insert(rows).select("id");
  fail("insert bookings", error);

  const upcoming = planned.filter((entry) => entry.startsAt > new Date()).length;
  console.log(`✓ ${data!.length} sample bookings (${upcoming} upcoming)`);
}

async function seedAdminUser() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("· skipped admin user (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD)");
    return;
  }

  const { data: existing } = await db.auth.admin.listUsers({ perPage: 200 });
  const match = existing?.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );

  if (match) {
    const { error } = await db.auth.admin.updateUserById(match.id, { password });
    fail("update admin password", error);
    console.log(`✓ admin user ${email} (password reset)`);
    return;
  }

  const { error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  fail("create admin user", error);
  console.log(`✓ admin user ${email}`);
}

async function main() {
  console.log(`\nSeeding ${url}\n`);
  const today = todayInShop();
  const timeOff = planTimeOff(today);

  await wipe();
  const serviceIds = await seedServices();
  const staffIds = await seedStaff();
  await seedAssignments(staffIds, serviceIds);
  await seedWorkingHours(staffIds);
  await seedTimeOff(staffIds, timeOff);
  await seedBookings(staffIds, serviceIds, today, timeOff);
  await seedAdminUser();

  console.log(
    `\nDone. Shop time is now ${formatInTimeZone(new Date(), SHOP_TIMEZONE, "EEE d MMM, HH:mm")} (${SHOP_TIMEZONE}).\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
