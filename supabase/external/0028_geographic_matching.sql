-- ============================================================================
-- Repara — 0028 GEOGRAPHIC MATCHING
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Does NOT touch 0025/0026/0027 objects.
--
-- Provider geography reuses existing columns (no duplicates):
--   service_providers.postal_code          = in-shop service ZIP / mobile base ZIP
--   service_providers.service_radius_miles = mobile travel radius (null for in-shop)
-- Distance is computed server-side in the app from a ZIP-centroid table, so a
-- geocoding provider can be added later without schema changes.
--
-- Adds only the customer's optional, request-specific distance preference.
-- null = "nearby" (default). Never written to the customer's account profile.
-- ============================================================================

alter table public.service_requests
  add column if not exists provider_distance_miles integer;

do $$ begin
  alter table public.service_requests
    add constraint service_requests_provider_distance_chk
    check (provider_distance_miles is null or provider_distance_miles in (10, 25, 50));
exception when duplicate_object then null; end $$;

comment on column public.service_requests.provider_distance_miles is
  'Optional customer preference: max miles to an in-shop provider (10/25/50). Null = nearby default.';
comment on column public.service_providers.service_radius_miles is
  'Mobile travel radius in miles (5/10/15/25/50). Null for in-shop-only providers.';
