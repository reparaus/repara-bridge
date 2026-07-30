-- ============================================================================
-- Repara — portable backend schema for a self-owned Supabase project
-- ----------------------------------------------------------------------------
-- Run this ONCE in the SQL editor of YOUR Supabase project.
-- It reproduces everything Repara currently uses, plus the forward-looking
-- tables (service records, inspections, maintenance recommendations).
-- It is idempotent-ish: safe on a fresh project, uses IF NOT EXISTS where possible.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enum types
do $$ begin create type public.app_role as enum ('admin','staff'); exception when duplicate_object then null; end $$;
do $$ begin create type public.contact_method as enum ('text','call','email'); exception when duplicate_object then null; end $$;
do $$ begin create type public.drivetrain_type as enum ('fwd','rwd','awd','4wd','unknown'); exception when duplicate_object then null; end $$;
do $$ begin create type public.vehicle_data_source as enum ('vin','customer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.request_status as enum ('new','reviewing','quoted','accepted','declined','scheduled','in_progress','completed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.quote_status as enum ('draft','sent','accepted','declined','expired'); exception when duplicate_object then null; end $$;
do $$ begin create type public.quote_item_type as enum ('labor','part','fee','discount'); exception when duplicate_object then null; end $$;
do $$ begin create type public.appointment_status as enum ('pending','scheduled','completed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.inspection_result as enum ('pass','attention','fail','not_inspected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.recommendation_status as enum ('open','scheduled','completed','declined','expired'); exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ shared helpers
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
do $$ begin
  create policy "users read own roles" on public.user_roles
    for select to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Convenience: any Repara staff member (admin or staff).
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

-- ================================================================= core data
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  phone text not null,
  email text,
  preferred_contact_method public.contact_method not null default 'text',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  vin text,
  year integer,
  make text,
  model text,
  trim text,
  engine_displacement numeric,
  engine_code text,
  cylinder_count integer,
  fuel_type text,
  is_hybrid boolean,
  drivetrain public.drivetrain_type not null default 'unknown',
  body_type text,
  engine_source public.vehicle_data_source,
  drivetrain_source public.vehicle_data_source,
  mileage integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vehicles_customer on public.vehicles(customer_id);
create index if not exists idx_vehicles_vin on public.vehicles(vin);

create sequence if not exists public.request_number_seq;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('R-' || nextval('public.request_number_seq')::text),
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_category text not null,
  service_subcategory text,
  services jsonb not null default '[]'::jsonb,   -- [{key,label,answers}] — multi-service
  symptoms text[] not null default '{}',
  details jsonb not null default '{}'::jsonb,
  notes text,
  mileage integer,
  zip_code text not null,
  service_location_type text not null default 'mobile',
  status public.request_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_requests_status on public.service_requests(status);
create index if not exists idx_requests_created on public.service_requests(created_at desc);
create index if not exists idx_requests_customer on public.service_requests(customer_id);

-- Normalized companion to service_requests.services (multi-service, queryable).
create table if not exists public.requested_services (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  service_key text not null,
  service_label text not null,
  answers jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_requested_services_request on public.requested_services(service_request_id);

create table if not exists public.mileage_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete set null,
  mileage integer not null check (mileage >= 0 and mileage <= 2000000),
  source text not null default 'quote_request',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mileage_records_vehicle_recorded_idx on public.mileage_records(vehicle_id, recorded_at desc);

create table if not exists public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  storage_path text not null,
  file_type text,
  created_at timestamptz not null default now()
);
create index if not exists idx_attachments_request on public.request_attachments(service_request_id);

-- ==================================================================== quotes
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  version integer not null default 1,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status public.quote_status not null default 'draft',
  parts_subtotal numeric not null default 0,
  labor_subtotal numeric not null default 0,
  fees_total numeric not null default 0,
  discount_total numeric not null default 0,
  tax_total numeric not null default 0,
  estimated_total numeric not null default 0,
  customer_notes text,
  internal_notes text,
  expiration_date date,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quotes_request on public.quotes(service_request_id);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  item_type public.quote_item_type not null,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_quote_items_quote on public.quote_items(quote_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status public.appointment_status not null default 'pending',
  service_location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ====================================== completed work, inspections, upsells
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  vin text,
  mileage integer,
  performed_at timestamptz not null default now(),
  technician_name text,
  technician_user_id uuid references auth.users(id) on delete set null,
  labor_hours numeric,
  labor_total numeric not null default 0,
  parts_total numeric not null default 0,
  total numeric not null default 0,
  summary text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_service_records_vehicle on public.service_records(vehicle_id, performed_at desc);

create table if not exists public.service_record_items (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references public.service_records(id) on delete cascade,
  item_type public.quote_item_type not null default 'labor',
  service_key text,
  description text not null,
  part_number text,
  part_brand text,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_service_record_items_record on public.service_record_items(service_record_id);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid references public.service_records(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  mileage integer,
  performed_at timestamptz not null default now(),
  technician_name text,
  overall_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inspections_vehicle on public.inspections(vehicle_id, performed_at desc);

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  category text not null,          -- e.g. 'brakes', 'tires', 'fluids'
  item_key text not null,          -- e.g. 'front_pad_thickness'
  label text not null,
  result public.inspection_result not null default 'not_inspected',
  measurement numeric,
  measurement_unit text,
  notes text,
  photo_path text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_inspection_items_inspection on public.inspection_items(inspection_id);

-- Verified manufacturer maintenance intervals get loaded here later.
-- Intentionally left EMPTY — no invented intervals.
create table if not exists public.maintenance_intervals (
  id uuid primary key default gen_random_uuid(),
  make text,
  model text,
  year_start integer,
  year_end integer,
  engine_code text,
  drivetrain public.drivetrain_type,
  service_key text not null,
  service_label text not null,
  interval_miles integer,
  interval_months integer,
  severe_interval_miles integer,
  severe_interval_months integer,
  source text,                     -- provenance of the verified data
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_maintenance_intervals_lookup on public.maintenance_intervals(make, model, service_key);

create table if not exists public.maintenance_recommendations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_key text not null,
  service_label text not null,
  reason text,
  basis jsonb not null default '{}'::jsonb,   -- inputs used (mileage, last service, interval id)
  due_at_mileage integer,
  due_at_date date,
  status public.recommendation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_recommendations_vehicle on public.maintenance_recommendations(vehicle_id, status);

-- --------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'customers','vehicles','service_requests','mileage_records','quotes','appointments',
    'service_records','inspections','maintenance_intervals','maintenance_recommendations'
  ] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================ RLS + PRIVILEGES
-- Least privilege model:
--   * anon      : NO table access at all. The public quote form writes through a
--                 server function using the service role, so the browser never
--                 needs table grants. Public quote viewing is done by token
--                 through a server function too.
--   * authenticated (Repara staff) : full access, gated by has_role/is_staff.
--   * service_role : full access for server functions.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','vehicles','service_requests','requested_services','mileage_records',
    'request_attachments','quotes','quote_items','appointments','service_records',
    'service_record_items','inspections','inspection_items','maintenance_intervals',
    'maintenance_recommendations'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff manage %1$s" on public.%1$I', t);
    execute format(
      'create policy "staff manage %1$s" on public.%1$I for all to authenticated
         using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
  end loop;
end $$;

revoke all on sequence public.request_number_seq from anon;
grant usage, select on sequence public.request_number_seq to service_role, authenticated;

-- ==================================================================== STORAGE
-- Private bucket for customer-uploaded photos. Not publicly enumerable;
-- reads happen through signed URLs generated server-side.
insert into storage.buckets (id, name, public)
values ('request-photos','request-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "anon can upload request photos" on storage.objects;
create policy "anon can upload request photos" on storage.objects
  for insert to anon
  with check (bucket_id = 'request-photos');

drop policy if exists "staff read request photos" on storage.objects;
create policy "staff read request photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'request-photos' and public.is_staff(auth.uid()));

drop policy if exists "staff manage request photos" on storage.objects;
create policy "staff manage request photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'request-photos' and public.is_staff(auth.uid()))
  with check (bucket_id = 'request-photos' and public.is_staff(auth.uid()));

-- ============================================================== admin bootstrap
-- After creating your admin user in Authentication → Users, run:
--   insert into public.user_roles (user_id, role)
--   values ('<your-auth-user-uuid>', 'admin');
