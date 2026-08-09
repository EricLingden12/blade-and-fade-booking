-- ============================================================================
-- 0002 — shop location
--
-- Moves the shop's address and map pin out of `src/lib/shop.ts` and into the
-- settings row, so the owner can change where the shop is without a deploy.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Already included in schema.sql for fresh installs; this file is for a
-- database created before the location was editable.
-- ============================================================================

alter table public.shop_settings
  add column if not exists address_lines   text[] not null
    default array['Unit 4, Al Fahidi Street', 'Bur Dubai, Dubai, UAE'],
  -- Nullable as a pair: a shop can publish an address before anyone has
  -- bothered to drop a pin. The map simply doesn't render until both exist.
  add column if not exists latitude        numeric(9, 6),
  add column if not exists longitude       numeric(9, 6),
  -- Optional override for the "Get directions" button. When null the link is
  -- built from the coordinates, which is right almost always; this exists for
  -- the case where the owner has a curated Google/Apple Maps place link.
  add column if not exists map_url         text,
  -- Free text for the things a map pin can't say: "above the pharmacy",
  -- "entrance on the side street", "parking behind the building".
  add column if not exists directions_note text;

-- ----------------------------------------------------------------------------
-- Constraints
--
-- Dropped first so the file can be re-run: ADD CONSTRAINT has no IF NOT EXISTS.
-- ----------------------------------------------------------------------------

alter table public.shop_settings
  drop constraint if exists shop_settings_address_shape;
alter table public.shop_settings
  add constraint shop_settings_address_shape check (
    -- coalesce matters: array_length of an empty array is NULL, not 0, and a
    -- CHECK that evaluates to NULL *passes*. Without this, '{}' slips through
    -- and the site renders a shop with no address.
    coalesce(array_length(address_lines, 1), 0) between 1 and 4
    and array_position(address_lines, '') is null
    and array_position(address_lines, null) is null
  );

alter table public.shop_settings
  drop constraint if exists shop_settings_latitude_range;
alter table public.shop_settings
  add constraint shop_settings_latitude_range check (
    latitude is null or latitude between -90 and 90
  );

alter table public.shop_settings
  drop constraint if exists shop_settings_longitude_range;
alter table public.shop_settings
  add constraint shop_settings_longitude_range check (
    longitude is null or longitude between -180 and 180
  );

-- Half a coordinate is not a location. Enforcing the pair here means the app
-- never has to handle "latitude but no longitude".
alter table public.shop_settings
  drop constraint if exists shop_settings_coords_paired;
alter table public.shop_settings
  add constraint shop_settings_coords_paired check (
    (latitude is null) = (longitude is null)
  );

-- Keeps a `javascript:` or otherwise unusable string out of an href we render.
alter table public.shop_settings
  drop constraint if exists shop_settings_map_url_shape;
alter table public.shop_settings
  add constraint shop_settings_map_url_shape check (
    map_url is null or map_url ~ '^https?://'
  );

comment on column public.shop_settings.address_lines is
  'Postal address, one array element per rendered line (1-4 lines).';
comment on column public.shop_settings.latitude is
  'Map pin latitude. Null together with longitude means "no pin set yet".';

-- Give the existing singleton row a pin so the map works immediately after the
-- migration. Only fills a blank — never overwrites a pin someone already set.
update public.shop_settings
   set latitude  = 25.263600,
       longitude = 55.297200
 where id = true
   and latitude is null;

-- Grants and RLS policies are unchanged: the columns live on a table that anon
-- may already read and only authenticated may update.
