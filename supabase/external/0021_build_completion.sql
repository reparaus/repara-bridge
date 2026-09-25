-- 0021 — Build → provider matching → completion. Additive and re-run safe.
-- Requires 0019 and 0020.
--
-- * Drivers can send their own request to active providers they choose.
-- * "Notify me when a provider is available" is stored for future onboarding.
-- * Completed jobs move approved build modifications to Installed; a Repara
--   Verified service record moves them to Verified. Nothing else can.

-- --------------------------------------------- provider availability alerts
create table if not exists public.provider_availability_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  category_keys text[] not null default '{}',
  zip_code text check (zip_code is null or char_length(zip_code) <= 10),
  channel text not null default 'in_app' check (channel in ('in_app','email')),
  status text not null default 'active' check (status in ('active','fulfilled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists provider_alerts_one_per_request
  on public.provider_availability_alerts (user_id, service_request_id) where status = 'active';

grant select, insert, update on public.provider_availability_alerts to authenticated;
grant all on public.provider_availability_alerts to service_role;
alter table public.provider_availability_alerts enable row level security;

drop policy if exists "owner manages provider alerts" on public.provider_availability_alerts;
create policy "owner manages provider alerts" on public.provider_availability_alerts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (service_request_id is null or public.owns_request(service_request_id)));

-- ----------------------------------------- driver: invite chosen providers
create or replace function public.driver_invite_providers(_request_id uuid, _provider_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.owns_request(_request_id) then raise exception 'Not allowed'; end if;
  if coalesce(array_length(_provider_ids, 1), 0) > 5 then raise exception 'Choose up to 5 providers'; end if;
  if exists (select 1 from public.provider_quotes where request_id = _request_id and status = 'accepted') then
    raise exception 'A quote was already approved for this request';
  end if;
  insert into public.request_provider_invites (request_id, provider_id, invited_by)
    select _request_id, p.id, auth.uid() from public.service_providers p
     where p.id = any(_provider_ids) and p.status::text = 'active' and not p.is_demo
    on conflict (request_id, provider_id) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.request_events (request_id, kind, actor, detail)
      values (_request_id, 'providers_invited', 'customer', jsonb_build_object('count', n));
  end if;
  return n;
end $$;
revoke all on function public.driver_invite_providers(uuid, uuid[]) from public, anon;
grant execute on function public.driver_invite_providers(uuid, uuid[]) to authenticated;

-- --------------------------------------- job completed → Installed
create or replace function public.build_mods_on_request_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.status::text) = 'completed' and lower(coalesce(old.status::text, '')) <> 'completed' then
    perform set_config('repara.trusted', 'on', true);
    update public.build_modifications set status = 'installed'
     where service_request_id = new.id and status = 'approved';
    if found then
      insert into public.request_events (request_id, kind, actor, provider_id)
        values (new.id, 'modifications_installed', 'system', new.provider_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists build_mods_on_request_complete on public.service_requests;
create trigger build_mods_on_request_complete after update of status on public.service_requests
  for each row execute function public.build_mods_on_request_complete();

-- ------------------------------ Repara Verified service record → Verified
create or replace function public.build_mods_on_verified_record()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.service_request_id is not null and new.source::text = 'repara_verified' then
    perform set_config('repara.trusted', 'on', true);
    update public.build_modifications set status = 'verified'
     where service_request_id = new.service_request_id and status in ('approved','installed');
    if found then
      insert into public.request_events (request_id, kind, actor, provider_id)
        values (new.service_request_id, 'modifications_verified', 'system', new.provider_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists build_mods_on_verified_record on public.service_records;
create trigger build_mods_on_verified_record after insert on public.service_records
  for each row execute function public.build_mods_on_verified_record();
