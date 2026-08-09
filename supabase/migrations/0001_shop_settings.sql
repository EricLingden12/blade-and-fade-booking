-- ============================================================================
-- 0001 — shop_settings
--
-- Adds admin-editable shop settings, starting with the display currency.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Already included in schema.sql for fresh installs; this file is for a
-- database that was created before the setting existed.
-- ============================================================================

-- A single-row table. The `id` check is what enforces "single row": there is
-- exactly one settings record, so reads never have to pick one and writes can
-- never fork the configuration.
create table if not exists public.shop_settings (
  id            boolean primary key default true,
  currency_code text not null default 'AED',
  updated_at    timestamptz not null default now(),

  constraint shop_settings_singleton check (id),
  -- ISO 4217: three uppercase letters. Keeps a typo out of every price label.
  constraint shop_settings_currency_shape check (currency_code ~ '^[A-Z]{3}$')
);

comment on table public.shop_settings is
  'Single-row shop configuration. Currency is a display label only — prices in services.price are not converted when it changes.';

insert into public.shop_settings (id, currency_code)
  values (true, 'AED')
  on conflict (id) do nothing;

drop trigger if exists shop_settings_touch_updated_at on public.shop_settings;
create trigger shop_settings_touch_updated_at
  before update on public.shop_settings
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- The currency is on every public price, so anon must read it. Only staff may
-- change it. Deletes and inserts are granted to nobody — the singleton row is
-- created here and must stay.
-- ----------------------------------------------------------------------------

alter table public.shop_settings enable row level security;

revoke all on public.shop_settings from anon, authenticated;
grant select on public.shop_settings to anon;
grant select, update on public.shop_settings to authenticated;
grant all on public.shop_settings to service_role;

drop policy if exists "Shop settings are public" on public.shop_settings;
create policy "Shop settings are public"
  on public.shop_settings for select
  to anon
  using (true);

drop policy if exists "Staff read shop settings" on public.shop_settings;
create policy "Staff read shop settings"
  on public.shop_settings for select
  to authenticated
  using (true);

drop policy if exists "Staff update shop settings" on public.shop_settings;
create policy "Staff update shop settings"
  on public.shop_settings for update
  to authenticated
  using (true)
  with check (true);
