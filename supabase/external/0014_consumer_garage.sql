-- ============================================================================
-- Repara — 0014 CONSUMER GARAGE V1 / CAR COMPANION FOUNDATION
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Nothing is renamed, dropped or destructively
-- migrated. The existing shop side (service_requests, job workspace, quotes,
-- communications, repair knowledge, admin auth/MFA) keeps working unchanged.
--
-- What this adds:
--   * profiles                     consumer account profile (separate from roles)
--   * canonical vehicle columns    vin_normalized, current_mileage, decoded metadata
--   * garage_vehicles              driver → vehicle ownership (not 1:1 forever)
--   * vehicle_mileage_history      provenance-aware odometer readings
--   * service history provenance   source / provider / verification on service_records
--   * vehicle_maintenance_state    source-backed maintenance state (never invented)
--   * vehicle_documents            receipts / service documentation foundation
--   * vehicle_data_connections     future authorized provider connections
--   * service_requests.user_id     links a guest-shaped request to an account
-- ============================================================================

-- ------------------------------------------------------------------- enums
do $$ begin create type public.vehicle_relationship as enum ('owner','co_owner','household','driver','previous_owner'); exception when duplicate_object then null; end $$;
do $$ begin create type public.mileage_source as enum ('owner','repara_shop','service_record','connected_vehicle','imported_provider','intake'); exception when duplicate_object then null; end $$;
do $$ begin create type public.history_provenance as enum ('repara_verified','imported','connected_vehicle','document','owner_provided'); exception when duplicate_object then null; end $$;
do $$ begin create type public.maintenance_state_status as enum ('up_to_date','coming_up','due','overdue','unknown'); exception when duplicate_object then null; end $$;
do $$ begin create type public.data_connection_status as enum ('pending','active','revoked','error'); exception when duplicate_object then null; end $$;

-- ============================================================ 1. PROFILES
-- A consumer profile is NOT a role. Roles stay in public.user_roles, so one
-- person can be a driver AND staff without conflicting identities.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  preferred_language text not null default 'en',
  notification_preferences jsonb not null default
    '{"maintenance":true,"recalls":true,"service_updates":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

do $$ begin
  create policy "own profile read" on public.profiles
    for select to authenticated using (id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own profile insert" on public.profiles
    for insert to authenticated with check (id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own profile update" on public.profiles
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
exception when duplicate_object then null; end $$;

-- New auth users get a profile automatically; admin/staff accounts simply have
-- one too, which costs nothing and keeps contact details in one place.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, preferred_language)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'first_name',''),
    coalesce(nullif(new.raw_user_meta_data->>'preferred_language',''), 'en')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================= 2. CANONICAL VEHICLE
-- public.vehicles becomes the ONE vehicle record shared by drivers, service
-- requests and the shop job workspace. customer_id becomes optional so a
-- driver-owned vehicle can exist before any service request.
alter table public.vehicles alter column customer_id drop not null;
alter table public.vehicles add column if not exists vin_normalized text;
alter table public.vehicles add column if not exists current_mileage integer;
alter table public.vehicles add column if not exists mileage_updated_at timestamptz;
alter table public.vehicles add column if not exists decoded_vehicle_metadata jsonb not null default '{}'::jsonb;
alter table public.vehicles add column if not exists nickname text;

-- Keep vin_normalized in sync without touching the original vin value.
create or replace function public.normalize_vehicle_vin()
returns trigger language plpgsql set search_path = public as $$
begin
  new.vin_normalized := nullif(upper(regexp_replace(coalesce(new.vin,''), '[^A-Za-z0-9]', '', 'g')), '');
  return new;
end $$;
drop trigger if exists set_vehicles_vin_normalized on public.vehicles;
create trigger set_vehicles_vin_normalized
  before insert or update of vin on public.vehicles
  for each row execute function public.normalize_vehicle_vin();

update public.vehicles
   set vin_normalized = nullif(upper(regexp_replace(coalesce(vin,''), '[^A-Za-z0-9]', '', 'g')), '')
 where vin_normalized is null and vin is not null;

create index if not exists idx_vehicles_vin_normalized on public.vehicles(vin_normalized);

-- ======================================== 3. GARAGE / VEHICLE OWNERSHIP
create table if not exists public.garage_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  relationship public.vehicle_relationship not null default 'owner',
  nickname text,
  is_primary boolean not null default false,
  ownership_started_at timestamptz,
  ownership_ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_garage_user_vehicle
  on public.garage_vehicles(user_id, vehicle_id) where ownership_ended_at is null;
create index if not exists idx_garage_user on public.garage_vehicles(user_id);

grant select, insert, update, delete on public.garage_vehicles to authenticated;
grant all on public.garage_vehicles to service_role;
alter table public.garage_vehicles enable row level security;
do $$ begin
  create policy "own garage" on public.garage_vehicles
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Possession of a VIN never proves ownership: access is granted by an ACTIVE
-- garage link only, and shop staff access stays on the existing is_staff path.
create or replace function public.owns_vehicle(_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.garage_vehicles
     where vehicle_id = _vehicle_id
       and user_id = auth.uid()
       and ownership_ended_at is null
  )
$$;

-- Drivers may read/update the canonical vehicles they own, and create new ones.
do $$ begin
  create policy "owner reads vehicle" on public.vehicles
    for select to authenticated using (public.owns_vehicle(id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner updates vehicle" on public.vehicles
    for update to authenticated using (public.owns_vehicle(id)) with check (public.owns_vehicle(id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated creates vehicle" on public.vehicles
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

-- ================================================== 4. MILEAGE HISTORY
create table if not exists public.vehicle_mileage_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  mileage integer not null check (mileage >= 0 and mileage <= 2000000),
  recorded_at timestamptz not null default now(),
  source public.mileage_source not null default 'owner',
  source_reference text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_mileage_history_vehicle
  on public.vehicle_mileage_history(vehicle_id, recorded_at desc);

grant select, insert on public.vehicle_mileage_history to authenticated;
grant all on public.vehicle_mileage_history to service_role;
alter table public.vehicle_mileage_history enable row level security;
do $$ begin
  create policy "owner reads mileage" on public.vehicle_mileage_history
    for select to authenticated using (public.owns_vehicle(vehicle_id) or public.is_staff(auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner records mileage" on public.vehicle_mileage_history
    for insert to authenticated with check (public.owns_vehicle(vehicle_id) or public.is_staff(auth.uid()));
exception when duplicate_object then null; end $$;

-- current_mileage is a convenience mirror of the newest CREDIBLE reading. An
-- older or lower reading is stored in history but never lowers the mirror
-- (odometer replacement handling can build on this later).
create or replace function public.apply_mileage_reading()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.vehicles v
     set current_mileage = new.mileage,
         mileage_updated_at = new.recorded_at
   where v.id = new.vehicle_id
     and (v.current_mileage is null or new.mileage >= v.current_mileage)
     and (v.mileage_updated_at is null or new.recorded_at >= v.mileage_updated_at);
  return new;
end $$;
drop trigger if exists apply_vehicle_mileage on public.vehicle_mileage_history;
create trigger apply_vehicle_mileage
  after insert on public.vehicle_mileage_history
  for each row execute function public.apply_mileage_reading();

-- ============================== 5. SERVICE HISTORY + PROVENANCE (reuse)
-- public.service_records already exists for shop work. It becomes the single
-- vehicle history table with explicit provenance, so owner-entered records are
-- never presented as verified.
alter table public.service_records add column if not exists service_date date;
alter table public.service_records add column if not exists provider_type text;
alter table public.service_records add column if not exists provider_name text;
alter table public.service_records add column if not exists shop_id uuid;
alter table public.service_records add column if not exists source public.history_provenance not null default 'repara_verified';
alter table public.service_records add column if not exists source_record_id text;
alter table public.service_records add column if not exists verification_status text not null default 'unverified';
alter table public.service_records add column if not exists total_amount numeric;
alter table public.service_records add column if not exists notes text;
alter table public.service_records add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.service_records alter column customer_id drop not null;

update public.service_records set service_date = performed_at::date where service_date is null;

alter table public.service_record_items add column if not exists service_type text;
alter table public.service_record_items add column if not exists category text;
alter table public.service_record_items add column if not exists component text;
alter table public.service_record_items add column if not exists status text;
alter table public.service_record_items add column if not exists structured_metadata jsonb not null default '{}'::jsonb;

do $$ begin
  create policy "owner reads service records" on public.service_records
    for select to authenticated using (public.owns_vehicle(vehicle_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner adds service records" on public.service_records
    for insert to authenticated
    with check (public.owns_vehicle(vehicle_id) and source = 'owner_provided' and created_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner edits own service records" on public.service_records
    for update to authenticated
    using (public.owns_vehicle(vehicle_id) and source = 'owner_provided' and created_by = auth.uid())
    with check (public.owns_vehicle(vehicle_id) and source = 'owner_provided');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner reads service record items" on public.service_record_items
    for select to authenticated using (
      exists (select 1 from public.service_records r
               where r.id = service_record_id and public.owns_vehicle(r.vehicle_id))
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner adds service record items" on public.service_record_items
    for insert to authenticated with check (
      exists (select 1 from public.service_records r
               where r.id = service_record_id
                 and public.owns_vehicle(r.vehicle_id)
                 and r.source = 'owner_provided')
    );
exception when duplicate_object then null; end $$;

-- ================================== 6. MAINTENANCE STATE (source-backed)
-- public.maintenance_intervals stays the definition table and stays EMPTY until
-- verified source data is loaded. No generic intervals are invented here.
alter table public.maintenance_intervals add column if not exists conditions text;
alter table public.maintenance_intervals add column if not exists source_reference text;
alter table public.maintenance_intervals add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.vehicle_maintenance_state (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  maintenance_interval_id uuid references public.maintenance_intervals(id) on delete set null,
  service_key text not null,
  service_label text not null,
  last_completed_service_record_id uuid references public.service_records(id) on delete set null,
  last_completed_mileage integer,
  last_completed_date date,
  estimated_due_mileage integer,
  estimated_due_date date,
  status public.maintenance_state_status not null default 'unknown',
  source text,
  confidence text not null default 'unknown',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (vehicle_id, service_key)
);
create index if not exists idx_maintenance_state_vehicle on public.vehicle_maintenance_state(vehicle_id, status);

grant select on public.vehicle_maintenance_state to authenticated;
grant all on public.vehicle_maintenance_state to service_role;
alter table public.vehicle_maintenance_state enable row level security;
do $$ begin
  create policy "owner reads maintenance state" on public.vehicle_maintenance_state
    for select to authenticated using (public.owns_vehicle(vehicle_id) or public.is_staff(auth.uid()));
exception when duplicate_object then null; end $$;

-- ============================================ 7. VEHICLE DOCUMENTS
create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  service_record_id uuid references public.service_records(id) on delete set null,
  document_type text not null default 'receipt',
  title text,
  storage_path text not null,
  file_type text,
  extraction_status text not null default 'not_processed',
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vehicle_documents_vehicle on public.vehicle_documents(vehicle_id, created_at desc);

grant select, insert, update, delete on public.vehicle_documents to authenticated;
grant all on public.vehicle_documents to service_role;
alter table public.vehicle_documents enable row level security;
do $$ begin
  create policy "owner manages documents" on public.vehicle_documents
    for all to authenticated using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public)
values ('vehicle-documents','vehicle-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "owner uploads vehicle documents" on storage.objects;
create policy "owner uploads vehicle documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vehicle-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owner reads vehicle documents" on storage.objects;
create policy "owner reads vehicle documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'vehicle-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================ 8. FUTURE AUTHORIZED DATA CONNECTIONS
-- Structure only. No provider integration is implemented, and provider
-- credentials/tokens are NEVER stored here — only connection metadata.
create table if not exists public.vehicle_data_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  shop_id uuid,
  provider text not null,
  connection_type text not null,
  external_account_id text,
  external_vehicle_id text,
  connection_status public.data_connection_status not null default 'pending',
  authorized_scopes text[] not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.vehicle_data_connections to authenticated;
grant all on public.vehicle_data_connections to service_role;
alter table public.vehicle_data_connections enable row level security;
do $$ begin
  create policy "own connections" on public.vehicle_data_connections
    for select to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ================================ 9. SERVICE REQUESTS ↔ ACCOUNTS
-- Guest requests keep working exactly as before; user_id is optional and only
-- set when a signed-in driver creates (or later claims) a request.
alter table public.service_requests add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_requests_user on public.service_requests(user_id);

do $$ begin
  create policy "owner reads own requests" on public.service_requests
    for select to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','garage_vehicles','vehicle_maintenance_state','vehicle_documents','vehicle_data_connections'
  ] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
