-- 0011_job_concerns.sql
-- Concern-centric job architecture + information provenance + assignment-ready
-- requests.
--
-- Purely ADDITIVE and safe to re-run. Nothing from 0001–0010 is renamed,
-- replaced or deleted. Existing requests, quotes, findings and outcomes keep
-- working exactly as they are.

-- ---------------------------------------------------------------- concerns
-- One customer concern / inspection request / diagnostic track inside a job.
-- The customer's own words are preserved in `customer_report` and are NEVER
-- overwritten by technician or AI text — each provenance layer has its own
-- column:
--   customer_report      → what the customer said (unverified)
--   technician_observed  → what the technician actually saw/measured
--   confirmed_cause      → what the technician confirms as the cause
--   repair_performed     → what was actually done
--   verification/outcome → whether it was resolved and how that was verified
create table if not exists public.job_concerns (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  -- Where this concern came from. 'derived' = built from intake by Repara.
  origin text not null default 'derived'
    check (origin in ('derived','service','customer_text','technician')),
  customer_report text,
  -- Diagnostically useful intake answers carried forward: [{question, answer}]
  intake_details jsonb not null default '[]'::jsonb,
  concern_status text not null default 'not_inspected'
    check (concern_status in ('not_inspected','verified','not_verified','unable_to_duplicate','deferred')),
  tests_performed text,
  technician_observed text,
  confirmed_cause text,
  -- Raw technician shorthand + the AI-cleaned wording the technician approved.
  shorthand text,
  story text,
  story_approved_at timestamptz,
  repair_performed text,
  verification text,
  outcome text
    check (outcome is null or outcome in
      ('resolved','not_resolved','not_yet_known','unable_to_verify','deferred','further_diagnosis','monitor','inspection_only')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.job_concerns is
  'One customer concern / inspection track inside a job. Keeps customer-reported, technician-observed and confirmed information in separate columns so provenance is never blurred.';

create index if not exists job_concerns_request_idx
  on public.job_concerns (service_request_id, sort_order, created_at);

-- ------------------------------------------- concern links + provenance bits
alter table public.job_diagnostics
  add column if not exists concern_id uuid references public.job_concerns(id) on delete set null;

alter table public.job_findings
  add column if not exists concern_id uuid references public.job_concerns(id) on delete set null,
  add column if not exists evidence text,
  -- 'confirmed' = technician verified it; 'suspected' = needs verification.
  add column if not exists confidence text not null default 'confirmed',
  add column if not exists ai_drafted boolean not null default false,
  -- An AI-drafted finding is only official once a human approves it.
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.job_recommendations
  add column if not exists concern_id uuid references public.job_concerns(id) on delete set null,
  add column if not exists performed_status text not null default 'pending';

-- ------------------------------------------------------- assignment-ready job
-- Repara owns the customer relationship. A request may later be fulfilled by
-- another participating provider, so acceptance/assignment is recorded on the
-- request instead of being implied by "the admin is the technician".
alter table public.service_requests
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists assignment_status text not null default 'unassigned',
  add column if not exists assigned_provider text,
  add column if not exists assigned_technician text;

comment on column public.service_requests.assignment_status is
  'unassigned | self | assigned | declined. Manual today; a provider directory can populate assigned_provider later without schema change.';

-- --------------------------------------------------------- grants + policies
do $$
begin
  revoke all on public.job_concerns from anon;
  grant select, insert, update, delete on public.job_concerns to authenticated;
  grant all on public.job_concerns to service_role;
  alter table public.job_concerns enable row level security;

  drop policy if exists "verified admins read job_concerns" on public.job_concerns;
  create policy "verified admins read job_concerns" on public.job_concerns
    for select to authenticated using (public.is_verified_admin(auth.uid()));

  drop policy if exists "verified admins write job_concerns" on public.job_concerns;
  create policy "verified admins write job_concerns" on public.job_concerns
    for insert to authenticated with check (public.is_verified_admin(auth.uid()));

  drop policy if exists "verified admins update job_concerns" on public.job_concerns;
  create policy "verified admins update job_concerns" on public.job_concerns
    for update to authenticated using (public.is_verified_admin(auth.uid()))
    with check (public.is_verified_admin(auth.uid()));

  drop policy if exists "verified admins delete job_concerns" on public.job_concerns;
  create policy "verified admins delete job_concerns" on public.job_concerns
    for delete to authenticated using (public.is_verified_admin(auth.uid()));
end $$;
