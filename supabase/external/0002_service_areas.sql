-- ============================================================================
-- Repara — 0002: service areas + service-area eligibility on service requests
-- ----------------------------------------------------------------------------
-- Run this ONCE in the SQL editor of your Supabase project, AFTER 0001.
-- It is additive only: no table is dropped, no existing row is modified.
-- ============================================================================

-- 1) New request status used by the admin dashboard ("contacted").
--    ADD VALUE must run on its own, outside a transaction block.
alter type public.request_status add value if not exists 'contacted';

-- 2) Service-area eligibility recorded on each request.
do $$ begin
  create type public.service_area_status as enum ('eligible','outside_area','unknown');
exception when duplicate_object then null; end $$;

alter table public.service_requests
  add column if not exists service_area_status public.service_area_status not null default 'unknown',
  add column if not exists city text;

create index if not exists idx_requests_service_area
  on public.service_requests(service_area_status);
create index if not exists idx_requests_zip on public.service_requests(zip_code);

-- 3) Approved service areas (ZIP is the source of truth, never the typed city).
create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  zip_code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

revoke all on public.service_areas from anon;
grant select, insert, update, delete on public.service_areas to authenticated;
grant all on public.service_areas to service_role;
alter table public.service_areas enable row level security;

drop policy if exists "staff manage service_areas" on public.service_areas;
create policy "staff manage service_areas" on public.service_areas
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 4) Seed the currently approved areas: Corona + Riverside, CA.
insert into public.service_areas (city, zip_code, active) values
  ('Corona','92877',true),
  ('Corona','92878',true),
  ('Corona','92879',true),
  ('Corona','92880',true),
  ('Corona','92881',true),
  ('Corona','92882',true),
  ('Corona','92883',true),
  ('Riverside','92501',true),
  ('Riverside','92502',true),
  ('Riverside','92503',true),
  ('Riverside','92504',true),
  ('Riverside','92505',true),
  ('Riverside','92506',true),
  ('Riverside','92507',true),
  ('Riverside','92508',true),
  ('Riverside','92509',true),
  ('Riverside','92518',true),
  ('Riverside','92521',true)
on conflict (zip_code) do nothing;

-- 5) Backfill eligibility for requests that already exist.
update public.service_requests r
set service_area_status = 'eligible',
    city = coalesce(r.city, a.city)
from public.service_areas a
where a.active
  and a.zip_code = left(r.zip_code, 5)
  and r.service_area_status = 'unknown';

update public.service_requests r
set service_area_status = 'outside_area'
where r.service_area_status = 'unknown'
  and not exists (
    select 1 from public.service_areas a
    where a.active and a.zip_code = left(r.zip_code, 5)
  );
