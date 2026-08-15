-- 0007_repara_ai.sql
-- Repara AI (Phase 1): AI intake analysis + admin↔customer clarification thread.
-- Purely additive and safe to re-run. No existing column, row, policy or
-- migration is replaced, and no customer-submitted data is modified.

-- ---------------------------------------------------------------- AI fields
-- Stored on the request itself so the result can be reused without re-calling
-- the model (cost control) and consumed by later automation phases.
alter table public.service_requests
  add column if not exists ai_summary                text,
  add column if not exists ai_needs_clarification    boolean,
  add column if not exists ai_clarification_question text,
  add column if not exists ai_recommended_services   jsonb,
  add column if not exists ai_internal_notes         text,
  add column if not exists ai_confidence             numeric,
  add column if not exists ai_ready_to_quote         boolean,
  add column if not exists ai_analyzed_at            timestamptz,
  add column if not exists ai_dismissed_at           timestamptz,
  -- Clarification workflow state.
  add column if not exists last_customer_reply_at    timestamptz,
  add column if not exists needs_admin_review        boolean not null default false;

comment on column public.service_requests.ai_summary is
  'Admin-facing AI summary of the intake. Never shown to customers.';
comment on column public.service_requests.ai_clarification_question is
  'AI-suggested follow-up question. Editable by an admin before it is ever sent.';
comment on column public.service_requests.needs_admin_review is
  'True when a customer reply is waiting for an admin.';

-- ------------------------------------------------------- communication log
create table if not exists public.request_communications (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel   text not null check (channel in ('email', 'sms', 'web')),
  message   text not null,
  status    text not null default 'pending',
  sent_by   uuid references auth.users(id) on delete set null,
  ai_generated boolean not null default false,
  error     text,
  created_at timestamptz not null default now()
);

comment on table public.request_communications is
  'Admin↔customer messages for one service request. Outbound is only ever created after explicit admin confirmation.';

create index if not exists request_communications_request_idx
  on public.request_communications (service_request_id, created_at desc);

revoke all on public.request_communications from anon;
grant select, insert on public.request_communications to authenticated;
grant all on public.request_communications to service_role;

alter table public.request_communications enable row level security;

drop policy if exists "verified admins read communications" on public.request_communications;
create policy "verified admins read communications" on public.request_communications
  for select to authenticated
  using (public.is_verified_admin(auth.uid()));

drop policy if exists "verified admins write communications" on public.request_communications;
create policy "verified admins write communications" on public.request_communications
  for insert to authenticated
  with check (public.is_verified_admin(auth.uid()));

-- ------------------------------------------------------------ reply tokens
-- One random, single-purpose, revocable/expirable token per outbound question.
-- The customer reply page reads it through a server function using the service
-- role, so the browser never gets table access.
create table if not exists public.request_reply_tokens (
  token text primary key,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  communication_id uuid references public.request_communications(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists request_reply_tokens_request_idx
  on public.request_reply_tokens (service_request_id, created_at desc);

revoke all on public.request_reply_tokens from anon;
revoke all on public.request_reply_tokens from authenticated;
grant select on public.request_reply_tokens to authenticated;
grant all on public.request_reply_tokens to service_role;

alter table public.request_reply_tokens enable row level security;

drop policy if exists "verified admins read reply tokens" on public.request_reply_tokens;
create policy "verified admins read reply tokens" on public.request_reply_tokens
  for select to authenticated
  using (public.is_verified_admin(auth.uid()));
