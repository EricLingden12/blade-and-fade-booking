-- ============================================================================
-- 0006 — admin-editable booking rules
--
-- The four numbers that shape every offered slot were constants in
-- src/lib/shop.ts, so changing the turnover gap meant a code change and a
-- deploy. They now live with the rest of the shop's configuration.
--
-- Per-service duration is NOT here — it already lives on services.duration
-- and is editable on /admin/services. These are the rules that apply between
-- and around appointments, whatever the service.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.shop_settings
  -- Gap enforced on both sides of every booking: sweeping up, sterilising
  -- clippers, letting one customer leave before the next sits down.
  add column if not exists turnaround_minutes  integer not null default 10,
  -- The grid start times are offered on. 15 gives :00 :15 :30 :45.
  add column if not exists slot_interval_minutes integer not null default 15,
  -- How far ahead of now a booking must be, so nobody books the chair you're
  -- already standing at.
  add column if not exists lead_time_minutes   integer not null default 30,
  -- How far into the future the calendar opens.
  add column if not exists max_advance_days    integer not null default 60;

-- ----------------------------------------------------------------------------
-- Constraints
--
-- These are bounds on sanity, not on taste. A zero-minute slot interval would
-- generate an infinite loop; a 24-hour turnaround would sell nothing at all.
-- ----------------------------------------------------------------------------

alter table public.shop_settings
  drop constraint if exists shop_settings_turnaround_sane;
alter table public.shop_settings
  add constraint shop_settings_turnaround_sane check (
    turnaround_minutes >= 0 and turnaround_minutes <= 120
  );

-- Must divide the hour, or offered times drift away from the clock: a 7-minute
-- grid gives 09:00, 09:07, 09:14 … which reads as broken rather than precise.
alter table public.shop_settings
  drop constraint if exists shop_settings_slot_interval_sane;
alter table public.shop_settings
  add constraint shop_settings_slot_interval_sane check (
    slot_interval_minutes in (5, 10, 15, 20, 30, 60)
  );

alter table public.shop_settings
  drop constraint if exists shop_settings_lead_time_sane;
alter table public.shop_settings
  add constraint shop_settings_lead_time_sane check (
    lead_time_minutes >= 0 and lead_time_minutes <= 10080  -- a week
  );

alter table public.shop_settings
  drop constraint if exists shop_settings_max_advance_sane;
alter table public.shop_settings
  add constraint shop_settings_max_advance_sane check (
    max_advance_days >= 1 and max_advance_days <= 365
  );

comment on column public.shop_settings.turnaround_minutes is
  'Gap kept clear on both sides of every booking. Applied when generating slots, not enforced by the exclusion constraint — the shop must stay free to book back-to-back by hand.';
comment on column public.shop_settings.slot_interval_minutes is
  'Grid that candidate start times are snapped to. Must divide 60.';
