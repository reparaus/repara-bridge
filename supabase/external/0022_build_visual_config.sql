-- 0022 — Saved 3D preview settings per build (paint, wheel style, ride height).
-- Additive and re-run safe. Requires 0019. Existing owner RLS on
-- vehicle_builds already covers this column.
alter table public.vehicle_builds
  add column if not exists visual_config jsonb not null default '{}'::jsonb;
