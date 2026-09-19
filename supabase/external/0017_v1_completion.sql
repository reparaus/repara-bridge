-- 0017_v1_completion.sql
-- Repara V1 completion: durable closeout attribution, exact-once mileage,
-- real in-app notifications, and provider-owner access to assigned jobs.
-- Additive and safe to re-run. No production rows are removed or replaced.

-- ----------------------------------------------------------- job closeout
alter table public.job_outcomes
  add column if not exists customer_summary text,
  add column if not exists completion_mileage integer
    check (completion_mileage is null or completion_mileage between 0 and 2000000);

comment on column public.job_outcomes.customer_summary is
  'Human-approved customer-facing summary of completed work. Never an internal technician note.';

alter table public.service_records
  add column if not exists provider_id uuid references public.service_providers(id) on delete set null;

create index if not exists idx_service_records_provider
  on public.service_records(provider_id);

create unique index if not exists uq_mileage_history_vehicle_source_reference
  on public.vehicle_mileage_history(vehicle_id, source, source_reference)
  where source_reference is not null;

-- ---------------------------------------------------------- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete cascade,
  provider_id uuid references public.service_providers(id) on delete set null,
  event_type text not null,
  event_key text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc) where read_at is null;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "users mark own notifications read" on public.notifications;
create policy "users mark own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users delete own notifications" on public.notifications;
create policy "users delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------ provider job scope
create or replace function public.is_request_provider(_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.service_requests sr
      join public.service_providers p on p.id = sr.provider_id
     where sr.id = _request_id
       and p.owner_user_id = auth.uid()
  );
$$;

grant execute on function public.is_request_provider(uuid) to authenticated;

drop policy if exists "provider owner reads assigned requests" on public.service_requests;
create policy "provider owner reads assigned requests" on public.service_requests
  for select to authenticated using (public.is_request_provider(id));

-- Providers need to move their assigned work through the existing job-close
-- path. The application still validates every transition and RLS confines the
-- row to the provider profile owned by the signed-in identity.
grant update on public.service_requests to authenticated;
drop policy if exists "provider owner updates assigned requests" on public.service_requests;
create policy "provider owner updates assigned requests" on public.service_requests
  for update to authenticated using (public.is_request_provider(id))
  with check (public.is_request_provider(id));

do $$
declare t text;
begin
  foreach t in array array[
    'job_diagnostics','job_findings','job_recommendations',
    'job_activity','job_outcomes','job_concerns'
  ] loop
    execute format('drop policy if exists "provider owner reads %1$s" on public.%1$I', t);
    execute format(
      'create policy "provider owner reads %1$s" on public.%1$I for select to authenticated using (public.is_request_provider(service_request_id))', t);
    execute format('drop policy if exists "provider owner inserts %1$s" on public.%1$I', t);
    execute format(
      'create policy "provider owner inserts %1$s" on public.%1$I for insert to authenticated with check (public.is_request_provider(service_request_id))', t);
    execute format('drop policy if exists "provider owner updates %1$s" on public.%1$I', t);
    execute format(
      'create policy "provider owner updates %1$s" on public.%1$I for update to authenticated using (public.is_request_provider(service_request_id)) with check (public.is_request_provider(service_request_id))', t);
    execute format('drop policy if exists "provider owner deletes %1$s" on public.%1$I', t);
    execute format(
      'create policy "provider owner deletes %1$s" on public.%1$I for delete to authenticated using (public.is_request_provider(service_request_id))', t);
  end loop;
end $$;

-- The existing workspace reuses quotes, attachments and the customer thread.
-- Providers can touch only rows whose parent request belongs to their profile.
drop policy if exists "provider reads assigned request attachments" on public.request_attachments;
create policy "provider reads assigned request attachments" on public.request_attachments
  for select to authenticated using (public.is_request_provider(service_request_id));

drop policy if exists "provider manages assigned quotes" on public.quotes;
create policy "provider manages assigned quotes" on public.quotes
  for all to authenticated using (public.is_request_provider(service_request_id))
  with check (public.is_request_provider(service_request_id));

drop policy if exists "provider manages assigned quote items" on public.quote_items;
create policy "provider manages assigned quote items" on public.quote_items
  for all to authenticated using (
    exists (select 1 from public.quotes q where q.id = quote_id and public.is_request_provider(q.service_request_id))
  ) with check (
    exists (select 1 from public.quotes q where q.id = quote_id and public.is_request_provider(q.service_request_id))
  );

drop policy if exists "provider reads assigned communications" on public.request_communications;
create policy "provider reads assigned communications" on public.request_communications
  for select to authenticated using (public.is_request_provider(service_request_id));

drop policy if exists "provider writes assigned communications" on public.request_communications;
create policy "provider writes assigned communications" on public.request_communications
  for insert to authenticated with check (public.is_request_provider(service_request_id));

drop policy if exists "provider owner reads attributed service records" on public.service_records;
create policy "provider owner reads attributed service records" on public.service_records
  for select to authenticated using (
    exists (
      select 1 from public.service_providers p
       where p.id = provider_id and p.owner_user_id = auth.uid()
    )
  );