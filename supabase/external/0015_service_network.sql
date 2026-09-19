-- ============================================================================
-- Repara — 0015 SERVICE NETWORK + AUTOMATIC HISTORY FOUNDATION
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Nothing is renamed, dropped or destructively
-- migrated. The shop side (service_requests, job workspace, quotes, comms,
-- repair knowledge, admin auth/MFA) and the Garage from 0014 keep working.
--
-- What this adds:
--   * service_categories        one shared service taxonomy (consumer + provider)
--   * service_providers         provider profile architecture (no fake data)
--   * provider_services         which categories a provider actually offers
--   * provider_service_areas    where a provider works (matching input only)
--   * service_requests.*        service_category_key + provider_id + ai context
--   * service_records.*         integration metadata for AUTHORIZED future syncs
--   * one repara-verified record per job  (idempotent automatic history)
-- ============================================================================

-- ------------------------------------------------------------------- enums
do $$ begin create type public.provider_kind as enum (
  'mechanic','mobile_mechanic','independent_shop','dealership','detailer',
  'mobile_detailer','tint_shop','glass_shop','tire_shop','wheel_shop',
  'body_shop','paint_shop','ppf_wrap','performance_shop','audio_electronics','other'
); exception when duplicate_object then null; end $$;

do $$ begin create type public.provider_status as enum ('draft','active','paused','archived');
exception when duplicate_object then null; end $$;

-- ================================================== 1. SERVICE TAXONOMY
-- The SAME classification is used by the consumer Service area, Ask Repara
-- intent detection, provider profiles and future provider matching.
create table if not exists public.service_categories (
  key text primary key,
  group_key text not null,
  label_en text not null,
  label_es text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.service_categories to anon, authenticated;
grant all on public.service_categories to service_role;
alter table public.service_categories enable row level security;
do $$ begin
  create policy "service categories are public" on public.service_categories
    for select to anon, authenticated using (is_active);
exception when duplicate_object then null; end $$;

insert into public.service_categories (key, group_key, label_en, label_es, position) values
  ('general_mechanic','repair','General mechanic','Mecánico general',10),
  ('mobile_mechanic','repair','Mobile mechanic','Mecánico a domicilio',20),
  ('diagnostics','repair','Diagnostics','Diagnóstico',30),
  ('brakes','repair','Brakes','Frenos',40),
  ('electrical','repair','Electrical','Eléctrico',50),
  ('ac','repair','Air conditioning','Aire acondicionado',60),
  ('maintenance','repair','Maintenance','Mantenimiento',70),
  ('suspension','repair','Suspension','Suspensión',80),
  ('engine','repair','Engine','Motor',90),
  ('transmission','repair','Transmission','Transmisión',100),
  ('mobile_detailing','detail','Mobile detailing','Detallado a domicilio',110),
  ('detailing','detail','Detailing','Detallado',120),
  ('paint_correction','detail','Paint correction','Corrección de pintura',130),
  ('ceramic_coating','detail','Ceramic coating','Recubrimiento cerámico',140),
  ('ppf','detail','Paint protection film','Película protectora',150),
  ('wraps','detail','Wraps','Vinilos',160),
  ('windshield_replacement','glass','Windshield replacement','Cambio de parabrisas',170),
  ('glass_repair','glass','Glass repair','Reparación de cristales',180),
  ('window_tint','glass','Window tint','Polarizado',190),
  ('tires','tires','Tires','Llantas',200),
  ('mounting_balancing','tires','Mounting & balancing','Montaje y balanceo',210),
  ('alignment','tires','Alignment','Alineación',220),
  ('wheels','tires','Wheels','Rines',230),
  ('dent_repair','body','Dent repair','Reparación de golpes',240),
  ('body_repair','body','Body repair','Hojalatería',250),
  ('paint','body','Paint','Pintura',260),
  ('exhaust','performance','Exhaust','Escape',270),
  ('performance','performance','Performance','Rendimiento',280),
  ('audio','performance','Audio','Audio',290),
  ('electronics','performance','Electronics','Electrónica',300),
  ('accessories','performance','Accessories','Accesorios',310),
  ('towing','other','Towing','Grúa',320),
  ('roadside','other','Roadside assistance','Asistencia en carretera',330),
  ('other','other','Other automotive service','Otro servicio automotriz',340)
on conflict (key) do update
  set group_key = excluded.group_key,
      label_en = excluded.label_en,
      label_es = excluded.label_es,
      position = excluded.position;

-- ================================================== 2. PROVIDER PROFILES
-- Architecture only. Nothing here fabricates ratings, reviews, certifications
-- or availability: those columns stay null until a real provider supplies them.
-- is_demo separates development/demo rows from production providers.
create table if not exists public.service_providers (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  provider_kind public.provider_kind not null default 'independent_shop',
  status public.provider_status not null default 'draft',
  description text,
  city text,
  region text,
  postal_code text,
  service_radius_miles integer,
  offers_mobile boolean not null default false,
  offers_in_shop boolean not null default true,
  phone text,
  email text,
  website text,
  specialties text[] not null default '{}',
  certifications text[] not null default '{}',
  hours jsonb not null default '{}'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  owner_user_id uuid references auth.users(id) on delete set null,
  is_demo boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_providers_status on public.service_providers(status);

create table if not exists public.provider_services (
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  category_key text not null references public.service_categories(key) on delete cascade,
  primary key (provider_id, category_key)
);

create table if not exists public.provider_service_areas (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  city text,
  region text,
  postal_code text,
  radius_miles integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_provider_areas_provider on public.provider_service_areas(provider_id);

grant select on public.service_providers, public.provider_services, public.provider_service_areas
  to anon, authenticated;
grant all on public.service_providers, public.provider_services, public.provider_service_areas
  to service_role;
alter table public.service_providers enable row level security;
alter table public.provider_services enable row level security;
alter table public.provider_service_areas enable row level security;

-- Only ACTIVE, non-demo providers are publicly readable.
do $$ begin
  create policy "active providers are public" on public.service_providers
    for select to anon, authenticated using (status = 'active' and not is_demo);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "provider owner reads own" on public.service_providers
    for select to authenticated using (owner_user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "provider services readable" on public.provider_services
    for select to anon, authenticated using (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.status = 'active' and not p.is_demo)
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "provider areas readable" on public.provider_service_areas
    for select to anon, authenticated using (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.status = 'active' and not p.is_demo)
    );
exception when duplicate_object then null; end $$;

-- ====================================== 3. REQUESTS CARRY CLASSIFICATION
-- The existing free-text service_category stays untouched for compatibility.
alter table public.service_requests add column if not exists service_category_key text
  references public.service_categories(key) on delete set null;
alter table public.service_requests add column if not exists provider_id uuid
  references public.service_providers(id) on delete set null;
alter table public.service_requests add column if not exists ai_intent jsonb not null default '{}'::jsonb;
create index if not exists idx_requests_category_key on public.service_requests(service_category_key);

-- ============================ 4. AUTHORIZED INTEGRATION METADATA (future)
-- Provider-agnostic on purpose. No integration is implemented here: these
-- columns simply make a future AUTHORIZED sync possible without a redesign.
alter table public.service_records add column if not exists external_provider text;
alter table public.service_records add column if not exists external_vehicle_id text;
alter table public.service_records add column if not exists external_customer_id text;
alter table public.service_records add column if not exists external_record_id text;
alter table public.service_records add column if not exists last_synced_at timestamptz;
alter table public.service_records add column if not exists sync_status text;

-- One automatic Repara-verified history record per completed job, so closing a
-- job repeatedly updates the same record instead of duplicating history.
create unique index if not exists uq_service_records_repara_job
  on public.service_records(service_request_id)
  where source = 'repara_verified' and service_request_id is not null;
