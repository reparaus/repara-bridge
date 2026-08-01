-- 0005_admin_workflow.sql
-- Admin dashboard workflow support: status history + "new request" badge.
-- Additive and safe to re-run. No existing data is modified or removed.

-- 1) When an admin last opened a request (drives the unviewed badge).
alter table public.service_requests
  add column if not exists admin_viewed_at timestamptz;

comment on column public.service_requests.admin_viewed_at is
  'Set when a Repara admin opens the request in the dashboard. Null = not yet viewed.';

-- 2) Full status history for each request.
create table if not exists public.request_status_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists request_status_events_request_idx
  on public.request_status_events (service_request_id, created_at desc);

grant select, insert on public.request_status_events to authenticated;
grant all on public.request_status_events to service_role;

alter table public.request_status_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'request_status_events'
      and policyname = 'Admins can read status history'
  ) then
    create policy "Admins can read status history"
      on public.request_status_events
      for select
      to authenticated
      using (public.has_role(auth.uid(), 'admin'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'request_status_events'
      and policyname = 'Admins can write status history'
  ) then
    create policy "Admins can write status history"
      on public.request_status_events
      for insert
      to authenticated
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;
