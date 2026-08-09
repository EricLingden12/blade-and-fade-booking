-- ============================================================================
-- 0003 — shop hours and calendar closures
--
-- Two new tables:
--
--   shop_hours     the shop's own opening times, one row per weekday. Until
--                  now these were hardcoded in src/lib/shop.ts and were pure
--                  decoration — they said "we open at 10" but nothing stopped
--                  a barber's shift from selling a 09:00 slot. They are now
--                  the outer boundary the availability engine clamps to.
--
--   shop_closures  whole-day shutdowns by calendar date: Eid, a public
--                  holiday, a refurbishment week. Previously this meant adding
--                  leave for every barber one at a time.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Weekly opening hours
--
-- day_of_week is the primary key, so there is exactly one row per day and the
-- table can never drift into a half-defined week.
-- ----------------------------------------------------------------------------

create table if not exists public.shop_hours (
  day_of_week smallint primary key,
  is_open     boolean not null default true,
  opens       time not null default '10:00',
  closes      time not null default '21:00',
  updated_at  timestamptz not null default now(),

  constraint shop_hours_day_range check (day_of_week between 0 and 6),
  -- Times are kept even when the day is closed, so reopening a day restores
  -- the hours the owner last used instead of resetting to a default.
  constraint shop_hours_ordered check (closes > opens)
);

comment on table public.shop_hours is
  'Shop opening times, one row per weekday. The outer boundary for availability: a barber shift is clamped to these hours.';
comment on column public.shop_hours.day_of_week is
  '0 = Sunday … 6 = Saturday, matching JS getDay().';
comment on column public.shop_hours.opens is
  'Wall-clock time in the shop timezone (Asia/Dubai), not UTC.';

-- Seeded open seven days a week, matching what the site advertised before this
-- table existed. `do nothing` keeps a re-run from stamping over real edits.
insert into public.shop_hours (day_of_week, is_open, opens, closes) values
  (0, true, '12:00', '18:00'),
  (1, true, '10:00', '21:00'),
  (2, true, '10:00', '21:00'),
  (3, true, '10:00', '21:00'),
  (4, true, '10:00', '21:00'),
  (5, true, '10:00', '21:00'),
  (6, true, '09:00', '21:00')
on conflict (day_of_week) do nothing;

drop trigger if exists shop_hours_touch_updated_at on public.shop_hours;
create trigger shop_hours_touch_updated_at
  before update on public.shop_hours
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Calendar closures
--
-- Stored as `date`, not `timestamptz`, on purpose. A public holiday is a
-- calendar day in Dubai, not an instant — "25 December" must mean the same
-- thing regardless of which server renders it. This matches the DayKey type
-- the availability engine already works in.
-- ----------------------------------------------------------------------------

create table if not exists public.shop_closures (
  id         uuid primary key default gen_random_uuid(),
  starts_on  date not null,
  ends_on    date not null,
  reason     text,
  created_at timestamptz not null default now(),

  -- Inclusive range: a single-day closure has starts_on = ends_on.
  constraint shop_closures_ordered check (ends_on >= starts_on)
);

comment on table public.shop_closures is
  'Whole-day shop shutdowns. Inclusive date range in shop-local calendar days.';

create index if not exists shop_closures_range_idx
  on public.shop_closures (starts_on, ends_on);

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Both tables are public reads: opening hours are in the footer and closures
-- are announced on the site. Only staff may change them.
--
-- shop_hours gets no insert or delete — the seven rows are seeded here and the
-- week must stay complete. Closing a day is `is_open = false`, not a delete.
-- ----------------------------------------------------------------------------

alter table public.shop_hours    enable row level security;
alter table public.shop_closures enable row level security;

revoke all on public.shop_hours    from anon, authenticated;
revoke all on public.shop_closures from anon, authenticated;

grant select                        on public.shop_hours    to anon;
grant select, update                on public.shop_hours    to authenticated;
grant all                           on public.shop_hours    to service_role;

grant select                        on public.shop_closures to anon;
grant select, insert, update, delete on public.shop_closures to authenticated;
grant all                           on public.shop_closures to service_role;

drop policy if exists "Shop hours are public" on public.shop_hours;
create policy "Shop hours are public"
  on public.shop_hours for select
  to anon
  using (true);

drop policy if exists "Staff read shop hours" on public.shop_hours;
create policy "Staff read shop hours"
  on public.shop_hours for select
  to authenticated
  using (true);

drop policy if exists "Staff update shop hours" on public.shop_hours;
create policy "Staff update shop hours"
  on public.shop_hours for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Shop closures are public" on public.shop_closures;
create policy "Shop closures are public"
  on public.shop_closures for select
  to anon
  using (true);

drop policy if exists "Staff manage shop closures" on public.shop_closures;
create policy "Staff manage shop closures"
  on public.shop_closures for all
  to authenticated
  using (true)
  with check (true);
