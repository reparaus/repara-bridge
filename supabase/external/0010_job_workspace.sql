-- 0010_job_workspace.sql
-- Repara Job Workspace: diagnosis, findings, recommendations, technician AI
-- copilot, job activity timeline and structured repair outcomes.
--
-- Purely ADDITIVE and safe to re-run. No existing table, column, policy, row or
-- migration is replaced. Existing service requests keep working untouched: the
-- job data below hangs off service_requests.id.

-- --------------------------------------------------------------- job stages
-- The existing request_status enum already covers most of the lifecycle
-- (new, contacted, reviewing, quoted, accepted, declined, scheduled,
-- in_progress, completed, cancelled). Only the genuinely missing stages are
-- added — no renames, no redundant statuses.
alter type public.request_status add value if not exists 'ready_to_quote';
alter type public.request_status add value if not exists 'diagnosing';
alter type public.request_status add value if not exists 'awaiting_approval';
alter type public.request_status add value if not exists 'repairing';
alter type public.request_status add value if not exists 'closed';

-- ------------------------------------------------------------- diagnostics
-- Fast, structured technician documentation while working on the vehicle.
create table if not exists public.job_diagnostics (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  entry_type text not null check (entry_type in
    ('dtc','symptom_verified','inspection','test','note','repair','verification')),
  code text,
  title text not null,
  detail text,
  result text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.job_diagnostics is
  'Technician diagnostic activity for one job: DTCs, verified symptoms, inspections, tests, notes, repairs and post-repair verification.';

create index if not exists job_diagnostics_request_idx
  on public.job_diagnostics (service_request_id, created_at desc);

-- ---------------------------------------------------------------- findings
create table if not exists public.job_findings (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  title text not null,
  detail text,
  measurement text,
  severity text not null default 'recommended'
    check (severity in ('urgent','recommended','monitor','informational')),
  -- 'ai' findings are AI-drafted and only exist once a technician saved them.
  source text not null default 'technician' check (source in ('technician','ai')),
  status text not null default 'open' check (status in ('open','converted','resolved','dismissed')),
  diagnostic_id uuid references public.job_diagnostics(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.job_findings is
  'Something discovered during inspection/diagnosis. Reusable by Repara AI, recommendations, the quote builder and job closeout.';

create index if not exists job_findings_request_idx
  on public.job_findings (service_request_id, created_at desc);

-- --------------------------------------------------------- recommendations
create table if not exists public.job_recommendations (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  finding_id uuid references public.job_findings(id) on delete set null,
  title text not null,
  -- Customer-facing text. AI may draft it; an admin must approve before sending.
  customer_description text,
  internal_notes text,
  priority text not null default 'recommended'
    check (priority in ('urgent','recommended','monitor')),
  status text not null default 'draft'
    check (status in ('draft','approved','quoted','customer_approved','customer_declined','deferred')),
  ai_drafted boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.job_recommendations is
  'Technician/admin recommendation derived from a finding. Feeds the quote builder and additional-work approval.';

create index if not exists job_recommendations_request_idx
  on public.job_recommendations (service_request_id, created_at desc);

-- Ties a quote line back to the recommendation it came from (no retyping).
alter table public.quote_items
  add column if not exists recommendation_id uuid references public.job_recommendations(id) on delete set null;

-- ----------------------------------------------------------- ai copilot log
create table if not exists public.job_ai_messages (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  role text not null check (role in ('technician','assistant')),
  action text,
  content text not null,
  -- Structured assistant payload (causes, next steps, verification level).
  payload jsonb not null default '{}'::jsonb,
  -- Hash of the job context used, so unchanged context is not re-analyzed.
  context_digest text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.job_ai_messages is
  'Technician↔Repara AI copilot conversation for one job. Internal only, never customer-facing.';

create index if not exists job_ai_messages_request_idx
  on public.job_ai_messages (service_request_id, created_at asc);

-- ------------------------------------------------------------ job activity
create table if not exists public.job_activity (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.job_activity is
  'Auditable job timeline. Only events not already implied by existing timestamps/tables are recorded here.';

create index if not exists job_activity_request_idx
  on public.job_activity (service_request_id, created_at desc);

-- ------------------------------------------------------------ job outcomes
create table if not exists public.job_outcomes (
  service_request_id uuid primary key references public.service_requests(id) on delete cascade,
  original_concern text,
  confirmed_cause text,
  repair_performed text,
  resolved boolean,
  verification text,
  technician_notes text,
  remaining_recommendations text,
  completed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.job_outcomes is
  'Structured repair outcome captured at closeout. Kept clean so de-identified outcomes can support diagnostic pattern analysis later.';

-- --------------------------------------------------------- grants + policies
-- Admin/technician-only data. `anon` gets nothing; the customer-facing
-- approval path continues to run through the existing reply-token server
-- functions with the service role.
do $$
declare t text;
begin
  foreach t in array array[
    'job_diagnostics','job_findings','job_recommendations',
    'job_ai_messages','job_activity','job_outcomes'
  ] loop
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
