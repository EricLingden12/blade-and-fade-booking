-- ============================================================================
-- 0005 — booking deposits
--
-- A small payment taken at booking time to hold the chair. The balance is paid
-- in the shop; this exists to stop no-shows, not to collect the full price.
--
-- The interesting part is the *hold*. A booking now exists before its money
-- does: the row is inserted as `pending` the moment checkout starts, which
-- makes the exclusion constraint reserve the slot while the customer types
-- their card details. If they abandon it, `hold_expires_at` lets the slot go
-- again. Nothing is confirmed until Stripe says so, server to server.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Shop-level deposit configuration
-- ----------------------------------------------------------------------------

alter table public.shop_settings
  add column if not exists deposit_enabled boolean not null default false,
  -- Denominated in shop_settings.currency_code, like every other price here.
  add column if not exists deposit_amount  numeric(10, 2) not null default 0;

alter table public.shop_settings
  drop constraint if exists shop_settings_deposit_amount_sane;
alter table public.shop_settings
  add constraint shop_settings_deposit_amount_sane check (
    deposit_amount >= 0 and deposit_amount < 100000
  );

-- A deposit of nothing is not a deposit. Enforcing the pair here means the app
-- never has to handle "enabled but zero", which would create Stripe sessions
-- for 0 and fail at the API boundary instead of here.
alter table public.shop_settings
  drop constraint if exists shop_settings_deposit_enabled_needs_amount;
alter table public.shop_settings
  add constraint shop_settings_deposit_enabled_needs_amount check (
    not deposit_enabled or deposit_amount > 0
  );

comment on column public.shop_settings.deposit_amount is
  'Deposit taken at booking, in shop_settings.currency_code. Comes off the bill in the shop.';

-- ----------------------------------------------------------------------------
-- Per-booking payment state
-- ----------------------------------------------------------------------------

do $$
begin
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

alter table public.bookings
  add column if not exists payment_status public.payment_status
    not null default 'not_required',
  -- What was actually asked for, captured at booking time. The shop's deposit
  -- setting can change later; this must not move retrospectively.
  add column if not exists deposit_amount   numeric(10, 2),
  add column if not exists deposit_currency text,
  add column if not exists stripe_session_id       text,
  add column if not exists stripe_payment_intent   text,
  -- When an unpaid hold stops reserving the slot. Null once confirmed.
  add column if not exists hold_expires_at timestamptz;

comment on column public.bookings.hold_expires_at is
  'Unpaid pending bookings stop holding their slot after this instant. Null when the booking is settled.';

alter table public.bookings
  drop constraint if exists bookings_deposit_currency_shape;
alter table public.bookings
  add constraint bookings_deposit_currency_shape check (
    deposit_currency is null or deposit_currency ~ '^[A-Z]{3}$'
  );

-- Stripe session ids are unique per checkout; a duplicate means a webhook was
-- replayed or two sessions collided, and the database should say so.
create unique index if not exists bookings_stripe_session_idx
  on public.bookings (stripe_session_id)
  where stripe_session_id is not null;

-- Drives the sweep that releases abandoned holds.
create index if not exists bookings_hold_expiry_idx
  on public.bookings (hold_expires_at)
  where hold_expires_at is not null;

-- ----------------------------------------------------------------------------
-- Let anon create a pending booking
--
-- The existing insert policy pins status to 'confirmed'. With deposits on, a
-- booking legitimately starts life as 'pending', so the policy has to allow
-- both — and nothing else. A customer still cannot create a booking that is
-- already completed, or one that claims to be paid.
-- ----------------------------------------------------------------------------

-- This recreates the existing policy verbatim and adds ONE clause: the
-- payment_status guard. Every original check is preserved — the duration cap
-- and the active service/staff lookups are load-bearing, and dropping them
-- while "adding deposits" would quietly widen what anon can insert.
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

-- ----------------------------------------------------------------------------
-- Release abandoned holds
--
-- Called from the app before availability is computed, so a slot whose payment
-- was never completed comes back on sale without waiting for a scheduled job.
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

comment on function public.release_expired_holds() is
  'Cancels pending bookings whose payment window lapsed, freeing the slot. Idempotent.';

revoke all on function public.release_expired_holds() from public;
grant execute on function public.release_expired_holds()
  to anon, authenticated, service_role;
