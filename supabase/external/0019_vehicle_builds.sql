-- 0019 — Vehicle builds (planned configurations), build modifications and
-- the Repara estimate structure. Additive and re-run safe.
--
-- A build is a PLAN. Nothing here changes the actual vehicle record. Only
-- trusted server/admin workflows (service role) may move a modification to
-- quoted / approved / installed / verified.

create table if not exists public.vehicle_builds (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  preset text not null default 'custom' check (preset in ('stock','daily','show','track','custom')),
  is_active boolean not null default false,
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vehicle_builds_vehicle_idx on public.vehicle_builds (vehicle_id, user_id);
create unique index if not exists vehicle_builds_one_active
  on public.vehicle_builds (vehicle_id, user_id) where is_active and archived_at is null;

create table if not exists public.build_modifications (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.vehicle_builds(id) on delete cascade,
  category text not null,
  item text not null,
  detail text check (detail is null or char_length(detail) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'planned'
    check (status in ('planned','requested','quoted','approved','installed','verified','removed')),
  compatibility text not null default 'not_confirmed'
    check (compatibility in ('compatible','potentially_compatible','requires_verification','not_confirmed')),
  source text not null default 'owner' check (source in ('owner','suggestion')),
  service_request_id uuid references public.service_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists build_modifications_build_idx on public.build_modifications (build_id);

-- Estimates are only written by trusted server code with a real pricing source.
create table if not exists public.build_estimates (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.vehicle_builds(id) on delete cascade,
  modification_id uuid references public.build_modifications(id) on delete cascade,
  parts_low integer, parts_high integer,
  labor_low integer, labor_high integer,
  other_low integer, other_high integer,
  total_low integer, total_high integer,
  currency text not null default 'USD',
  region text,
  source text not null,
  confidence text not null check (confidence in ('high','medium','low')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists build_estimates_build_idx on public.build_estimates (build_id);

alter table public.service_requests
  add column if not exists build_id uuid references public.vehicle_builds(id) on delete set null;

grant select, insert, update, delete on public.vehicle_builds to authenticated;
grant select, insert, update, delete on public.build_modifications to authenticated;
grant select on public.build_estimates to authenticated;
grant all on public.vehicle_builds, public.build_modifications, public.build_estimates to service_role;

alter table public.vehicle_builds enable row level security;
alter table public.build_modifications enable row level security;
alter table public.build_estimates enable row level security;

create or replace function public.owns_build(_build_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vehicle_builds b
     where b.id = _build_id and b.user_id = auth.uid() and public.owns_vehicle(b.vehicle_id)
  )
$$;

drop policy if exists "owner manages builds" on public.vehicle_builds;
create policy "owner manages builds" on public.vehicle_builds for all to authenticated
  using (user_id = auth.uid() and public.owns_vehicle(vehicle_id))
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id));

drop policy if exists "owner manages build modifications" on public.build_modifications;
create policy "owner manages build modifications" on public.build_modifications for all to authenticated
  using (public.owns_build(build_id)) with check (public.owns_build(build_id));

drop policy if exists "owner reads build estimates" on public.build_estimates;
create policy "owner reads build estimates" on public.build_estimates for select to authenticated
  using (public.owns_build(build_id));

-- Owners may only plan, request or remove. Quoted/approved/installed/verified
-- and compatibility other than "not confirmed" come from trusted workflows.
create or replace function public.guard_build_modification()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'authenticated'
     or coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'authenticated' then
    if (tg_op = 'INSERT' or new.status is distinct from old.status)
       and new.status not in ('planned','requested','removed') then
      raise exception 'This status is set by the service workflow';
    end if;
    if tg_op = 'UPDATE' and old.status in ('installed','verified') and new.status is distinct from old.status then
      raise exception 'Installed work cannot be changed from the build';
    end if;
    if (tg_op = 'INSERT' or new.compatibility is distinct from old.compatibility)
       and new.compatibility <> 'not_confirmed' then
      raise exception 'Compatibility is only set from verified data';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_build_modification on public.build_modifications;
create trigger guard_build_modification before insert or update on public.build_modifications
  for each row execute function public.guard_build_modification();

create or replace function public.touch_vehicle_build()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_vehicle_build on public.vehicle_builds;
create trigger touch_vehicle_build before update on public.vehicle_builds
  for each row execute function public.touch_vehicle_build();
