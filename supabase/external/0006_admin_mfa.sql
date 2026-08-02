-- 0006_admin_mfa.sql
-- Admin identity + MFA-gated access to service requests.
-- Additive and safe to re-run. No customer data is modified or removed.

-- ------------------------------------------------------------- admin_users
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Approved Repara admin accounts. Created manually; there is no public sign-up.';

revoke all on public.admin_users from anon;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;

alter table public.admin_users enable row level security;

drop policy if exists "admins read own admin row" on public.admin_users;
create policy "admins read own admin row" on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());

-- Carry over anyone already granted the admin role in user_roles.
insert into public.admin_users (user_id, role)
select ur.user_id, 'admin'
from public.user_roles ur
where ur.role = 'admin'
on conflict (user_id) do nothing;

-- ------------------------------------------------- verified-admin predicate
-- TRUE only when the caller is an approved admin AND the current Supabase
-- session has completed phone MFA (assurance level aal2).
create or replace function public.is_verified_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (
       select 1 from public.admin_users a
       where a.user_id = _user_id and a.role = 'admin'
     );
$$;

-- Existing staff policies route through is_staff(); requiring MFA there keeps
-- every admin-facing table consistent (requests, customers, vehicles, quotes,
-- attachments, storage reads).
create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_verified_admin(_user_id);
$$;

-- --------------------------------------------- service_requests read/update
-- Public users get NO table access at all: the customer form inserts through a
-- server function using the service role, so anonymous submissions keep working
-- while the browser can never read, update or delete a request.
revoke all on public.service_requests from anon;

alter table public.service_requests enable row level security;

drop policy if exists "staff manage service_requests" on public.service_requests;

drop policy if exists "verified admins read service_requests" on public.service_requests;
create policy "verified admins read service_requests" on public.service_requests
  for select to authenticated
  using (public.is_verified_admin(auth.uid()));

drop policy if exists "verified admins update service_requests" on public.service_requests;
create policy "verified admins update service_requests" on public.service_requests
  for update to authenticated
  using (public.is_verified_admin(auth.uid()))
  with check (public.is_verified_admin(auth.uid()));

-- Status history stays readable/writable by verified admins only.
drop policy if exists "Admins can read status history" on public.request_status_events;
create policy "Admins can read status history" on public.request_status_events
  for select to authenticated
  using (public.is_verified_admin(auth.uid()));

drop policy if exists "Admins can write status history" on public.request_status_events;
create policy "Admins can write status history" on public.request_status_events
  for insert to authenticated
  with check (public.is_verified_admin(auth.uid()));
