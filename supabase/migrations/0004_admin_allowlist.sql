-- ============================================================================
-- 0004 — staff allowlist
--
-- Until now every admin policy asked "is this request authenticated?", which
-- made "has a Supabase account" the same thing as "runs the barbershop". That
-- was only safe because public sign-ups were disabled in the dashboard — a
-- checkbox, in a web UI, that nothing in this repo records or enforces.
--
-- This replaces that with an explicit list. Policies now ask "is this person
-- on the staff list?", so someone who signs up gets an account that can see
-- exactly nothing.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- SAFETY: every account that already exists is added to the list, so whoever
-- is using the dashboard today keeps working. Verify with the SELECT at the
-- bottom before closing the tab.
-- ============================================================================

create table if not exists public.admin_users (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  note     text,
  added_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Who may use /admin. Membership here — not merely having an account — is what every staff RLS policy checks.';

-- Nobody currently working gets locked out.
insert into public.admin_users (user_id, email, note)
select id, email, 'account existed when the allowlist was introduced'
  from auth.users
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- The predicate every staff policy uses
--
-- SECURITY DEFINER on purpose. A policy on `bookings` that selected from
-- `admin_users` directly would need the caller to hold SELECT on that table,
-- and `admin_users` has its own RLS — which is how you get infinite recursion.
-- Running the lookup as the owner sidesteps both problems.
--
-- `search_path` is pinned so the function body can't be redirected by a
-- caller-controlled search path.
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

comment on function public.is_staff() is
  'True when the current user is on the staff allowlist. Used by every "Staff manage …" policy.';

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- admin_users' own access
--
-- Staff may read the list. Nobody may change it through the API: adding a
-- colleague is a deliberate act, done here in the SQL editor. That also means
-- a compromised admin session cannot quietly promote another account.
-- ----------------------------------------------------------------------------

alter table public.admin_users enable row level security;

revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
grant all    on public.admin_users to service_role;

drop policy if exists "Staff read the staff list" on public.admin_users;
create policy "Staff read the staff list"
  on public.admin_users for select
  to authenticated
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- Re-point every staff policy at the allowlist
--
-- Each is dropped and recreated: `using (true)` becomes `using (is_staff())`.
-- The anon policies are untouched — the public site is unaffected.
-- ----------------------------------------------------------------------------

drop policy if exists "Staff manage services" on public.services;
create policy "Staff manage services"
  on public.services for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage barbers" on public.staff;
create policy "Staff manage barbers"
  on public.staff for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage service assignments" on public.staff_services;
create policy "Staff manage service assignments"
  on public.staff_services for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage working hours" on public.working_hours;
create policy "Staff manage working hours"
  on public.working_hours for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage time off" on public.time_off;
create policy "Staff manage time off"
  on public.time_off for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage bookings" on public.bookings;
create policy "Staff manage bookings"
  on public.bookings for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

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

drop policy if exists "Staff manage shop closures" on public.shop_closures;
create policy "Staff manage shop closures"
  on public.shop_closures for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- Check this before you close the tab.
--
-- Every row listed here can use /admin. If your own email is missing, add it
-- with:
--
--   insert into public.admin_users (user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
-- ----------------------------------------------------------------------------

select email, added_at from public.admin_users order by added_at;
