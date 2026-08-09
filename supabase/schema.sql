-- ============================================================================
-- Blade & Fade Barbershop — schema, constraints and Row Level Security
--
-- Run once, top to bottom, in the Supabase SQL editor.
-- Safe to re-run: every statement is idempotent.
--
-- Design notes
--   * Every point in time is `timestamptz`. Wall-clock times that recur weekly
--     (working_hours) are `time` and are interpreted in the shop's timezone by
--     the application — Postgres never needs to know the timezone.
--   * The double-booking guard is a Postgres exclusion constraint, not app
--     logic, so two concurrent inserts cannot both win.
--   * Customers have no accounts. The anon role may create a booking but may
--     never read one back; lookups by reference code go through server code
--     holding the service-role key.
-- ============================================================================

-- Required by the exclusion constraint below: lets a GiST index hold a plain
-- equality column (staff_id) alongside a range column.
create extension if not exists btree_gist;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum (
      'pending',
      'confirmed',
      'cancelled',
      'completed',
      'no_show'
    );
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  duration_minutes integer not null,
  price            numeric(10, 2) not null,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),

  constraint services_name_not_blank check (length(btrim(name)) > 0),
  -- Durations must land on the booking grid, or generated slots drift.
  constraint services_duration_positive check (duration_minutes > 0 and duration_minutes % 5 = 0),
  constraint services_price_non_negative check (price >= 0)
);

comment on table public.services is 'Bookable services. duration_minutes drives slot length.';

create table if not exists public.staff (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  bio         text,
  avatar_url  text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  constraint staff_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.staff is 'Barbers.';

-- Which barber performs which service.
create table if not exists public.staff_services (
  staff_id   uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create index if not exists staff_services_service_idx
  on public.staff_services (service_id);

-- A barber's recurring weekly schedule. Times are shop-local wall clock.
create table if not exists public.working_hours (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff(id) on delete cascade,
  day_of_week smallint not null,
  start_time  time not null,
  end_time    time not null,

  constraint working_hours_day_range check (day_of_week between 0 and 6),
  constraint working_hours_ordered check (end_time > start_time),
  -- One barber cannot have two shifts starting at the same moment on a day.
  constraint working_hours_unique_shift unique (staff_id, day_of_week, start_time)
);

comment on column public.working_hours.day_of_week is '0 = Sunday … 6 = Saturday, matching JS getDay().';
comment on column public.working_hours.start_time is 'Wall-clock time in the shop timezone (Asia/Dubai), not UTC.';

create index if not exists working_hours_staff_day_idx
  on public.working_hours (staff_id, day_of_week);

-- One-off blocks: holidays, sick days, a dentist appointment.
create table if not exists public.time_off (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),

  constraint time_off_ordered check (ends_at > starts_at)
);

create index if not exists time_off_staff_range_idx
  on public.time_off using gist (staff_id, tstzrange(starts_at, ends_at));

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  service_id     uuid not null references public.services(id) on delete restrict,
  staff_id       uuid not null references public.staff(id) on delete restrict,
  customer_name  text not null,
  customer_email text not null,
  customer_phone text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         public.booking_status not null default 'confirmed',
  notes          text,
  reference_code text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint bookings_ordered check (ends_at > starts_at),
  constraint bookings_name_not_blank check (length(btrim(customer_name)) > 0),
  constraint bookings_email_shape check (customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint bookings_phone_not_blank check (length(btrim(customer_phone)) >= 7),
  constraint bookings_reference_unique unique (reference_code)
);

comment on table public.bookings is 'Customer details live on the row — there are no customer accounts.';

create index if not exists bookings_staff_starts_idx
  on public.bookings (staff_id, starts_at);

create index if not exists bookings_starts_idx
  on public.bookings (starts_at desc);

create index if not exists bookings_status_starts_idx
  on public.bookings (status, starts_at);

-- ----------------------------------------------------------------------------
-- Double-booking prevention
--
-- The hard guarantee. Two customers hitting "confirm" on the same slot in the
-- same millisecond cannot both succeed: the loser's INSERT raises SQLSTATE
-- 23P01, which the app translates into "that slot was just taken".
--
-- Cancelled bookings are excluded from the constraint so a cancelled slot is
-- immediately rebookable.
--
-- Note: this enforces *literal* overlap. The 10-minute turnover buffer is a
-- scheduling rule applied when generating offered slots, not a correctness
-- rule — the admin must stay free to book back-to-back by hand.
-- ----------------------------------------------------------------------------

alter table public.bookings drop constraint if exists no_overlapping_bookings;

alter table public.bookings add constraint no_overlapping_bookings
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled');

-- ----------------------------------------------------------------------------
-- Reference codes
--
-- Short, human-readable, safe to read aloud over the phone: the alphabet omits
-- characters that are easy to confuse (0/O, 1/I/L, 2/Z, 5/S, 8/B).
-- ----------------------------------------------------------------------------

create or replace function public.generate_reference_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY34679';
  code text := '';
  i integer;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'BF-' || code;
end;
$$;

-- SECURITY DEFINER so the uniqueness probe sees every existing booking. Without
-- it the anon role's RLS view is empty, every candidate looks free, and
-- collisions surface as an opaque unique-violation instead of being retried.
create or replace function public.assign_booking_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  if new.reference_code is not null and length(btrim(new.reference_code)) > 0 then
    return new;
  end if;

  loop
    candidate := public.generate_reference_code();
    exit when not exists (
      select 1 from public.bookings b where b.reference_code = candidate
    );

    attempts := attempts + 1;
    if attempts >= 12 then
      raise exception 'Could not allocate a unique booking reference after % attempts', attempts;
    end if;
  end loop;

  new.reference_code := candidate;
  return new;
end;
$$;

drop trigger if exists bookings_assign_reference on public.bookings;
create trigger bookings_assign_reference
  before insert on public.bookings
  for each row execute function public.assign_booking_reference();

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Row Level Security
--
-- Two audiences:
--   anon          — the public site. Reads the menu, writes a booking. Nothing
--                   else, and it can never read a booking back.
--   authenticated — the shop owner, signed in through Supabase Auth. Public
--                   sign-ups must be disabled in the dashboard, which makes
--                   "authenticated" equivalent to "staff".
--
-- Table grants are revoked first so the privilege model is explicit rather than
-- inherited from Supabase's permissive defaults. RLS is the second lock.
-- ============================================================================

alter table public.services       enable row level security;
alter table public.staff          enable row level security;
alter table public.staff_services enable row level security;
alter table public.working_hours  enable row level security;
alter table public.time_off       enable row level security;
alter table public.bookings       enable row level security;

revoke all on public.services       from anon, authenticated;
revoke all on public.staff          from anon, authenticated;
revoke all on public.staff_services from anon, authenticated;
revoke all on public.working_hours  from anon, authenticated;
revoke all on public.time_off       from anon, authenticated;
revoke all on public.bookings       from anon, authenticated;

grant select on public.services to anon;
grant select on public.staff    to anon;
grant insert on public.bookings to anon;

grant select, insert, update, delete on public.services       to authenticated;
grant select, insert, update, delete on public.staff          to authenticated;
grant select, insert, update, delete on public.staff_services to authenticated;
grant select, insert, update, delete on public.working_hours  to authenticated;
grant select, insert, update, delete on public.time_off       to authenticated;
grant select, insert, update, delete on public.bookings       to authenticated;

-- The seed script and all server-side reads run as service_role. Granted
-- explicitly rather than relying on Supabase's default privileges.
grant all on public.services       to service_role;
grant all on public.staff          to service_role;
grant all on public.staff_services to service_role;
grant all on public.working_hours  to service_role;
grant all on public.time_off       to service_role;
grant all on public.bookings       to service_role;

-- --- services ---------------------------------------------------------------

drop policy if exists "Active services are public" on public.services;
create policy "Active services are public"
  on public.services for select
  to anon
  using (is_active);

drop policy if exists "Staff manage services" on public.services;
create policy "Staff manage services"
  on public.services for all
  to authenticated
  using (true)
  with check (true);

-- --- staff ------------------------------------------------------------------

drop policy if exists "Active barbers are public" on public.staff;
create policy "Active barbers are public"
  on public.staff for select
  to anon
  using (is_active);

drop policy if exists "Staff manage barbers" on public.staff;
create policy "Staff manage barbers"
  on public.staff for all
  to authenticated
  using (true)
  with check (true);

-- --- staff_services ---------------------------------------------------------
-- Not public. The booking flow needs this mapping, but it is resolved
-- server-side while computing availability, so anon never touches it directly.

drop policy if exists "Staff manage service assignments" on public.staff_services;
create policy "Staff manage service assignments"
  on public.staff_services for all
  to authenticated
  using (true)
  with check (true);

-- --- working_hours ----------------------------------------------------------

drop policy if exists "Staff manage working hours" on public.working_hours;
create policy "Staff manage working hours"
  on public.working_hours for all
  to authenticated
  using (true)
  with check (true);

-- --- time_off ---------------------------------------------------------------

drop policy if exists "Staff manage time off" on public.time_off;
create policy "Staff manage time off"
  on public.time_off for all
  to authenticated
  using (true)
  with check (true);

-- --- bookings ---------------------------------------------------------------
-- Deliberately no SELECT policy for anon: a customer cannot enumerate, guess at
-- or read back any booking, including their own. The confirmation screen and
-- the /booking/[reference] lookup are served by server code using the
-- service-role key.

drop policy if exists "Anyone may request a booking" on public.bookings;
create policy "Anyone may request a booking"
  on public.bookings for insert
  to anon
  with check (
    -- A public request can never arrive pre-approved or backdated.
    status in ('pending', 'confirmed')
    and starts_at > now()
    and ends_at > starts_at
    -- Guard against a client claiming an absurd duration.
    and ends_at <= starts_at + interval '8 hours'
    and exists (
      select 1 from public.services s
      where s.id = service_id and s.is_active
    )
    and exists (
      select 1 from public.staff st
      where st.id = staff_id and st.is_active
    )
  );

drop policy if exists "Staff manage bookings" on public.bookings;
create policy "Staff manage bookings"
  on public.bookings for all
  to authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- Done. Next: `npm run seed`.
-- ----------------------------------------------------------------------------
