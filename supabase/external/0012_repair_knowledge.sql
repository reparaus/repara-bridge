-- 0012_repair_knowledge.sql
-- Repara Repair Knowledge foundation + technician-facing translation cache +
-- concern normalization/dedup support.
--
-- Purely ADDITIVE and safe to re-run. Nothing from 0001–0011 is renamed,
-- dropped or rewritten. No production row is modified.

-- =========================================================== repair knowledge
-- Source-agnostic technical knowledge about a vehicle/repair. NHTSA recall data
-- is the FIRST source; licensed OEM information, procedures, specifications,
-- wiring, Repara-created knowledge and confirmed repair outcomes land in the
-- same table later without a redesign. Provenance and licensing metadata are
-- never stripped during normalization.
create table if not exists public.repair_knowledge (
  id uuid primary key default gen_random_uuid(),

  -- ---------------------------------------------------------------- provenance
  source text not null,                       -- 'nhtsa' | 'repara' | 'technician' | licensed provider id
  source_record_id text,                      -- campaign number, bulletin id, internal id
  source_document_id text,
  source_type text not null default 'public_dataset'
    check (source_type in ('public_api','public_dataset','licensed','oem','repara','technician','shop')),
  license_type text not null default 'public'
    check (license_type in ('public','licensed','proprietary','repara_owned','shop_owned')),
  source_url text,
  document_url text,
  published_at timestamptz,
  raw_source_metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),

  -- ------------------------------------------------------------ what this is
  information_type text not null
    check (information_type in (
      'recall','service_bulletin','manufacturer_communication','procedure',
      'diagnostic_procedure','wiring','component_location','connector_information',
      'specification','torque_specification','fluid_capacity','reset_relearn',
      'dtc_information','technician_knowledge','repair_outcome')),
  title text not null,
  summary text,

  -- --------------------------------------------------------- vehicle fitment
  make text,
  model text,
  year_start integer,
  year_end integer,
  engine text,
  drivetrain text,
  trim text,
  applicability jsonb not null default '{}'::jsonb,

  -- ------------------------------------------------------------ classification
  system text,
  subsystem text,
  component text,

  -- ------------------------------------------------------------------ content
  -- Structured content is only populated from sources Repara is authorized to
  -- store. Never AI-generated, never manual-derived without authorization.
  structured_steps jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  special_tools jsonb not null default '[]'::jsonb,
  torque_specs jsonb not null default '[]'::jsonb,
  fluid_specs jsonb not null default '[]'::jsonb,
  related_dtcs text[] not null default '{}',
  symptoms text[] not null default '{}',
  conditions text,
  metadata jsonb not null default '{}'::jsonb,
  normalized_search_text text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.repair_knowledge is
  'Source-backed vehicle/repair knowledge. Source-agnostic: NHTSA public data today; licensed procedures, specifications and Repara-owned confirmed outcomes later. Provenance and license metadata are required.';

-- Idempotent syncing: one record per source document per information type.
create unique index if not exists repair_knowledge_source_key
  on public.repair_knowledge (source, information_type, source_record_id);

create index if not exists repair_knowledge_vehicle_idx
  on public.repair_knowledge (lower(make), lower(model), year_start, year_end);
create index if not exists repair_knowledge_type_idx
  on public.repair_knowledge (information_type, published_at desc);
create index if not exists repair_knowledge_search_idx
  on public.repair_knowledge using gin (to_tsvector('english', coalesce(normalized_search_text, '')));

-- ======================================================= job ↔ knowledge link
create table if not exists public.job_knowledge_matches (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  repair_knowledge_id uuid not null references public.repair_knowledge(id) on delete cascade,
  concern_id uuid references public.job_concerns(id) on delete set null,
  -- Internal ranking only. Never shown to technicians as a precision figure.
  match_score numeric,
  match_reason text,
  matched_terms text[] not null default '{}',
  ai_relevance text,
  technician_confirmed_relevant boolean,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_request_id, repair_knowledge_id)
);

comment on table public.job_knowledge_matches is
  'Which source-backed knowledge may be relevant to THIS job. match_score is internal ranking, not technician-facing precision.';

create index if not exists job_knowledge_matches_request_idx
  on public.job_knowledge_matches (service_request_id, created_at desc);

-- Bookkeeping so opening a job does not re-hit external sources.
alter table public.service_requests
  add column if not exists knowledge_synced_at timestamptz;

-- ==================================================== translation cache (i18n)
-- Customers write in their own language; technicians read normalized English.
-- The ORIGINAL text is never overwritten anywhere — it is cached alongside its
-- normalized translation and reused instead of re-translating on page load.
create table if not exists public.content_translations (
  id uuid primary key default gen_random_uuid(),
  source_hash text not null,
  source_language text not null default 'auto',
  target_language text not null default 'en',
  original_text text not null,
  translated_text text not null,
  detected_language text,
  provider text,
  created_at timestamptz not null default now(),
  unique (source_hash, target_language)
);

comment on table public.content_translations is
  'Cache of normalized translations of customer-authored text for technician-facing display. Originals are preserved verbatim in their own tables.';

-- ============================================ concern normalization / dedup
alter table public.job_concerns
  add column if not exists normalized_title text,
  add column if not exists normalized_customer_report text,
  add column if not exists normalized_intake_details jsonb not null default '[]'::jsonb,
  add column if not exists source_language text,
  -- Conservative semantic dedup: a duplicate concern is MERGED, never deleted.
  add column if not exists merged_into_id uuid references public.job_concerns(id) on delete set null,
  add column if not exists merged_reports jsonb not null default '[]'::jsonb,
  add column if not exists normalized_at timestamptz;

comment on column public.job_concerns.merged_into_id is
  'Set when this concern was found to describe the same underlying problem as another. The original wording is preserved as supporting customer context.';

-- ------------------------------------------------------- grants + RLS policies
do $$
declare t text;
begin
  foreach t in array array['repair_knowledge','job_knowledge_matches','content_translations'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "verified admins read %1$s" on public.%1$I', t);
    execute format(
      'create policy "verified admins read %1$s" on public.%1$I for select to authenticated using (public.is_verified_admin(auth.uid()))', t);

    execute format('drop policy if exists "verified admins write %1$s" on public.%1$I', t);
    execute format(
      'create policy "verified admins write %1$s" on public.%1$I for insert to authenticated with check (public.is_verified_admin(auth.uid()))', t);

    execute format('drop policy if exists "verified admins update %1$s" on public.%1$I', t);
    execute format(
      'create policy "verified admins update %1$s" on public.%1$I for update to authenticated using (public.is_verified_admin(auth.uid())) with check (public.is_verified_admin(auth.uid()))', t);

    execute format('drop policy if exists "verified admins delete %1$s" on public.%1$I', t);
    execute format(
      'create policy "verified admins delete %1$s" on public.%1$I for delete to authenticated using (public.is_verified_admin(auth.uid()))', t);
  end loop;
end $$;
