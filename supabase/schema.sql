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

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'not_required',  -- deposits were off when this was booked
      'pending',       -- checkout started, money not yet confirmed
      'paid',
      'refunded',
      'failed'
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

  -- Payment. A booking exists before its money does: with deposits on, the row
  -- is inserted as 'pending' so the exclusion constraint reserves the slot
  -- while the customer is at the checkout, and hold_expires_at releases it if
  -- they never finish.
  payment_status        public.payment_status not null default 'not_required',
  deposit_amount        numeric(10, 2),
  deposit_currency      text,
  stripe_session_id     text,
  stripe_payment_intent text,
  hold_expires_at       timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint bookings_ordered check (ends_at > starts_at),
  constraint bookings_name_not_blank check (length(btrim(customer_name)) > 0),
  constraint bookings_email_shape check (customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint bookings_phone_not_blank check (length(btrim(customer_phone)) >= 7),
  constraint bookings_reference_unique unique (reference_code),
  constraint bookings_deposit_currency_shape check (
    deposit_currency is null or deposit_currency ~ '^[A-Z]{3}$'
  )
);

comment on table public.bookings is 'Customer details live on the row — there are no customer accounts.';

create index if not exists bookings_staff_starts_idx
  on public.bookings (staff_id, starts_at);

create index if not exists bookings_starts_idx
  on public.bookings (starts_at desc);

create index if not exists bookings_status_starts_idx
  on public.bookings (status, starts_at);

-- A duplicate session id means a replayed webhook or two colliding checkouts;
-- the database should refuse rather than let the app guess.
create unique index if not exists bookings_stripe_session_idx
  on public.bookings (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists bookings_hold_expiry_idx
  on public.bookings (hold_expires_at)
  where hold_expires_at is not null;

-- Who may use /admin. Adding a colleague is a deliberate SQL action: there is
-- no insert privilege through the API, so a compromised admin session cannot
-- quietly promote another account.
create table if not exists public.admin_users (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  note     text,
  added_at timestamptz not null default now()
);

-- Single-row shop configuration. The `id` check enforces "exactly one row", so
-- reads never have to pick one and writes cannot fork the configuration.
create table if not exists public.shop_settings (
  id              boolean primary key default true,
  currency_code   text not null default 'AED',

  -- Where the shop is. Editable by the owner so a move doesn't need a deploy.
  address_lines   text[] not null
    default array['Unit 4, Al Fahidi Street', 'Bur Dubai, Dubai, UAE'],
  -- Nullable as a pair: an address can be published before anyone drops a pin.
  latitude        numeric(9, 6),
  longitude       numeric(9, 6),
  -- Optional override for "Get directions"; built from coordinates when null.
  map_url         text,
  -- The things a pin can't say: "above the pharmacy", "parking round the back".
  directions_note text,

  -- Deposit taken at booking to hold the chair. Denominated in currency_code,
  -- like every other price here. The balance is paid in the shop.
  deposit_enabled boolean not null default false,
  deposit_amount  numeric(10, 2) not null default 0,

  -- The rules that shape every offered slot. Per-service length is not here —
  -- that lives on services.duration_minutes.
  turnaround_minutes    integer not null default 10,
  slot_interval_minutes integer not null default 15,
  lead_time_minutes     integer not null default 30,
  max_advance_days      integer not null default 60,

  updated_at      timestamptz not null default now(),

  constraint shop_settings_singleton check (id),
  constraint shop_settings_currency_shape check (currency_code ~ '^[A-Z]{3}$'),
  constraint shop_settings_address_shape check (
    -- coalesce matters: array_length of an empty array is NULL, not 0, and a
    -- CHECK that evaluates to NULL *passes*. Without this, '{}' slips through
    -- and the site renders a shop with no address.
    coalesce(array_length(address_lines, 1), 0) between 1 and 4
    and array_position(address_lines, '') is null
    and array_position(address_lines, null) is null
  ),
  constraint shop_settings_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  constraint shop_settings_longitude_range check (
    longitude is null or longitude between -180 and 180
  ),
  -- Half a coordinate is not a location.
  constraint shop_settings_coords_paired check (
    (latitude is null) = (longitude is null)
  ),
  -- Keeps `javascript:` and friends out of an href we render.
  constraint shop_settings_map_url_shape check (
    map_url is null or map_url ~ '^https?://'
  ),
  constraint shop_settings_deposit_amount_sane check (
    deposit_amount >= 0 and deposit_amount < 100000
  ),
  -- A deposit of nothing is not a deposit. Enforcing the pair here keeps the
  -- app from ever asking Stripe to charge zero.
  constraint shop_settings_deposit_enabled_needs_amount check (
    not deposit_enabled or deposit_amount > 0
  ),
  constraint shop_settings_turnaround_sane check (
    turnaround_minutes >= 0 and turnaround_minutes <= 120
  ),
  -- Must divide the hour, or offered times drift off the clock: a 7-minute
  -- grid gives 09:00, 09:07, 09:14 … which reads as broken, not precise.
  constraint shop_settings_slot_interval_sane check (
    slot_interval_minutes in (5, 10, 15, 20, 30, 60)
  ),
  constraint shop_settings_lead_time_sane check (
    lead_time_minutes >= 0 and lead_time_minutes <= 10080
  ),
  constraint shop_settings_max_advance_sane check (
    max_advance_days >= 1 and max_advance_days <= 365
  )
);

comment on table public.shop_settings is
  'Single-row shop configuration. Currency is a display label only — prices in services.price are not converted when it changes.';

insert into public.shop_settings (id, currency_code, latitude, longitude)
  values (true, 'AED', 25.263600, 55.297200)
  on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Shop opening hours
--
-- One row per weekday, keyed by the day itself so the week can never be
-- half-defined. These are the outer boundary for availability: a barber's
-- shift is clamped to them, so a shift that runs past closing sells nothing
-- after closing.
-- ----------------------------------------------------------------------------

create table if not exists public.shop_hours (
  day_of_week smallint primary key,
  is_open     boolean not null default true,
  opens       time not null default '10:00',
  closes      time not null default '21:00',
  updated_at  timestamptz not null default now(),

  constraint shop_hours_day_range check (day_of_week between 0 and 6),
  -- Times survive a day being closed, so reopening restores what was there.
  constraint shop_hours_ordered check (closes > opens)
);

comment on column public.shop_hours.day_of_week is '0 = Sunday … 6 = Saturday, matching JS getDay().';
comment on column public.shop_hours.opens is 'Wall-clock time in the shop timezone (Asia/Dubai), not UTC.';

insert into public.shop_hours (day_of_week, is_open, opens, closes) values
  (0, true, '12:00', '18:00'),
  (1, true, '10:00', '21:00'),
  (2, true, '10:00', '21:00'),
  (3, true, '10:00', '21:00'),
  (4, true, '10:00', '21:00'),
  (5, true, '10:00', '21:00'),
  (6, true, '09:00', '21:00')
on conflict (day_of_week) do nothing;

-- Whole-day shutdowns: Eid, a public holiday, a refurbishment week.
--
-- `date`, not `timestamptz`, on purpose: a holiday is a calendar day in Dubai,
-- not an instant, and must mean the same thing on every server.
create table if not exists public.shop_closures (
  id         uuid primary key default gen_random_uuid(),
  starts_on  date not null,
  ends_on    date not null,
  reason     text,
  created_at timestamptz not null default now(),

  -- Inclusive: a one-day closure has starts_on = ends_on.
  constraint shop_closures_ordered check (ends_on >= starts_on)
);

create index if not exists shop_closures_range_idx
  on public.shop_closures (starts_on, ends_on);

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

drop trigger if exists shop_settings_touch_updated_at on public.shop_settings;
create trigger shop_settings_touch_updated_at
  before update on public.shop_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists shop_hours_touch_updated_at on public.shop_hours;
create trigger shop_hours_touch_updated_at
  before update on public.shop_hours
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
alter table public.shop_settings  enable row level security;
alter table public.shop_hours     enable row level security;
alter table public.shop_closures  enable row level security;
alter table public.admin_users    enable row level security;

revoke all on public.services       from anon, authenticated;
revoke all on public.staff          from anon, authenticated;
revoke all on public.staff_services from anon, authenticated;
revoke all on public.working_hours  from anon, authenticated;
revoke all on public.time_off       from anon, authenticated;
revoke all on public.bookings       from anon, authenticated;
revoke all on public.shop_settings  from anon, authenticated;
revoke all on public.shop_hours     from anon, authenticated;
revoke all on public.shop_closures  from anon, authenticated;
revoke all on public.admin_users    from anon, authenticated;

grant select on public.services to anon;
grant select on public.staff    to anon;
grant insert on public.bookings to anon;
-- The currency appears on every public price, so anon must be able to read it.
grant select on public.shop_settings to anon;
grant select on public.shop_hours    to anon;
grant select on public.shop_closures to anon;

grant select, insert, update, delete on public.services       to authenticated;
grant select, insert, update, delete on public.staff          to authenticated;
grant select, insert, update, delete on public.staff_services to authenticated;
grant select, insert, update, delete on public.working_hours  to authenticated;
grant select, insert, update, delete on public.time_off       to authenticated;
grant select, insert, update, delete on public.bookings       to authenticated;
-- No insert or delete: the singleton row is seeded above and must stay.
grant select, update on public.shop_settings to authenticated;
-- shop_hours gets no insert/delete: the seven rows are seeded and the week
-- must stay complete. Closing a day is is_open = false, not a delete.
grant select, update on public.shop_hours to authenticated;
grant select, insert, update, delete on public.shop_closures to authenticated;
grant select on public.admin_users to authenticated;

-- The seed script and all server-side reads run as service_role. Granted
-- explicitly rather than relying on Supabase's default privileges.
grant all on public.services       to service_role;
grant all on public.staff          to service_role;
grant all on public.staff_services to service_role;
grant all on public.working_hours  to service_role;
grant all on public.time_off       to service_role;
grant all on public.bookings       to service_role;
grant all on public.shop_settings  to service_role;

-- ----------------------------------------------------------------------------
-- Who counts as staff
--
-- Membership of `admin_users` — not merely holding a Supabase account — is what
-- every staff policy below checks. Without this, "signed up" would equal "runs
-- the barbershop", which is only safe while a dashboard checkbox stays ticked.
--
-- SECURITY DEFINER on purpose: a policy on `bookings` that selected from
-- `admin_users` directly would need the caller to hold SELECT on it, and that
-- table has its own RLS — which is how you get infinite recursion. Running the
-- lookup as the owner sidesteps both. `search_path` is pinned so the body can't
-- be redirected by a caller-controlled path.
-- ----------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated, anon, service_role;

drop policy if exists "Staff read the staff list" on public.admin_users;
create policy "Staff read the staff list"
  on public.admin_users for select
  to authenticated
  using (public.is_staff());

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
  using (public.is_staff())
  with check (public.is_staff());

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
  using (public.is_staff())
  with check (public.is_staff());

-- --- staff_services ---------------------------------------------------------
-- Not public. The booking flow needs this mapping, but it is resolved
-- server-side while computing availability, so anon never touches it directly.

drop policy if exists "Staff manage service assignments" on public.staff_services;
create policy "Staff manage service assignments"
  on public.staff_services for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- --- working_hours ----------------------------------------------------------

drop policy if exists "Staff manage working hours" on public.working_hours;
create policy "Staff manage working hours"
  on public.working_hours for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- --- time_off ---------------------------------------------------------------

drop policy if exists "Staff manage time off" on public.time_off;
create policy "Staff manage time off"
  on public.time_off for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

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
    -- …nor claim its money is already settled.
    and payment_status in ('not_required', 'pending')
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
  using (public.is_staff())
  with check (public.is_staff());

-- --- shop_settings -----------------------------------------------------------

drop policy if exists "Shop settings are public" on public.shop_settings;
create policy "Shop settings are public"
  on public.shop_settings for select
  to anon
  using (true);

drop policy if exists "Staff read shop settings" on public.shop_settings;
create policy "Staff read shop settings"
  on public.shop_settings for select
  to authenticated
  using (public.is_staff());

drop policy if exists "Staff update shop settings" on public.shop_settings;
create policy "Staff update shop settings"
  on public.shop_settings for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());


drop policy if exists "Shop hours are public" on public.shop_hours;
create policy "Shop hours are public"
  on public.shop_hours for select
  to anon
  using (true);

drop policy if exists "Staff read shop hours" on public.shop_hours;
create policy "Staff read shop hours"
  on public.shop_hours for select
  to authenticated
  using (public.is_staff());

drop policy if exists "Staff update shop hours" on public.shop_hours;
create policy "Staff update shop hours"
  on public.shop_hours for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Shop closures are public" on public.shop_closures;
create policy "Shop closures are public"
  on public.shop_closures for select
  to anon
  using (true);

drop policy if exists "Staff manage shop closures" on public.shop_closures;
create policy "Staff manage shop closures"
  on public.shop_closures for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- Releasing abandoned holds
--
-- Called from the app before availability is computed, so a slot whose payment
-- was never completed returns to sale without waiting for a scheduled job.
-- SECURITY DEFINER because anon triggers it indirectly and must not hold
-- update rights on bookings.
-- ----------------------------------------------------------------------------

create or replace function public.release_expired_holds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  released integer;
begin
  update public.bookings
     set status = 'cancelled',
         payment_status = case
           when payment_status = 'pending' then 'failed'
           else payment_status
         end,
         hold_expires_at = null
   where status = 'pending'
     and hold_expires_at is not null
     and hold_expires_at < now();

  get diagnostics released = row_count;
  return released;
end;
$$;

revoke all on function public.release_expired_holds() from public;
grant execute on function public.release_expired_holds()
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Done. Next: `npm run seed`.
-- ----------------------------------------------------------------------------
