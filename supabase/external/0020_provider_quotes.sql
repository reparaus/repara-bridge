-- 0020 — Real provider quotes, quote versions, provider invites and the
-- request event timeline. Additive and re-run safe. Requires 0019.
--
-- Provider pricing is provider-authored and stored separately from Repara
-- estimates. Every revision is a new row; earlier versions are kept.
-- Invited providers see a contact-free brief; contact details stay private
-- until the driver selects them.

-- ------------------------------------------------------------ invites
create table if not exists public.request_provider_invites (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','viewed','quoted','declined','selected','not_selected')),
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, provider_id)
);
create index if not exists rpi_provider_idx on public.request_provider_invites (provider_id, created_at desc);

-- ------------------------------------------------------------- quotes
create table if not exists public.provider_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  version integer not null check (version >= 1),
  parts_cents integer not null default 0 check (parts_cents >= 0),
  labor_cents integer not null default 0 check (labor_cents >= 0),
  fees_cents integer not null default 0 check (fees_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'USD',
  notes text check (notes is null or char_length(notes) <= 2000),
  timeframe text check (timeframe is null or char_length(timeframe) <= 200),
  warranty text check (warranty is null or char_length(warranty) <= 500),
  status text not null default 'submitted' check (status in ('submitted','superseded','accepted','declined','withdrawn')),
  submitted_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, provider_id, version)
);
create index if not exists provider_quotes_request_idx on public.provider_quotes (request_id);

-- ------------------------------------------------------------- events
create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  kind text not null,
  actor text not null check (actor in ('customer','provider','admin','system')),
  provider_id uuid references public.service_providers(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists request_events_request_idx on public.request_events (request_id, created_at);

-- Reads only; every write goes through the functions below.
grant select on public.request_provider_invites, public.provider_quotes, public.request_events to authenticated;
grant all on public.request_provider_invites, public.provider_quotes, public.request_events to service_role;

alter table public.request_provider_invites enable row level security;
alter table public.provider_quotes enable row level security;
alter table public.request_events enable row level security;

create or replace function public.owns_provider(_provider_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.service_providers where id = _provider_id and owner_user_id = auth.uid())
$$;

create or replace function public.owns_request(_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.service_requests where id = _request_id and user_id = auth.uid())
$$;

drop policy if exists "invite parties read" on public.request_provider_invites;
create policy "invite parties read" on public.request_provider_invites for select to authenticated
  using (public.owns_provider(provider_id) or public.owns_request(request_id) or public.is_verified_admin(auth.uid()));

drop policy if exists "quote parties read" on public.provider_quotes;
create policy "quote parties read" on public.provider_quotes for select to authenticated
  using (public.owns_provider(provider_id) or public.owns_request(request_id) or public.is_verified_admin(auth.uid()));

drop policy if exists "event parties read" on public.request_events;
create policy "event parties read" on public.request_events for select to authenticated
  using (
    public.owns_request(request_id)
    or public.is_verified_admin(auth.uid())
    or (provider_id is not null and public.owns_provider(provider_id))
  );

-- Trusted-workflow flag so these functions may advance build statuses past
-- what the 0019 guard allows drivers to set directly.
create or replace function public.guard_build_modification()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('repara.trusted', true), '') = 'on' then
    return new;
  end if;
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

-- A driver who picked a provider on submit invites that provider automatically.
create or replace function public.auto_invite_chosen_provider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.provider_id is not null and (tg_op = 'INSERT' or new.provider_id is distinct from old.provider_id) then
    insert into public.request_provider_invites (request_id, provider_id)
      select new.id, new.provider_id
       where exists (select 1 from public.service_providers where id = new.provider_id and status = 'active')
      on conflict (request_id, provider_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists auto_invite_chosen_provider on public.service_requests;
create trigger auto_invite_chosen_provider after insert or update of provider_id on public.service_requests
  for each row execute function public.auto_invite_chosen_provider();

-- ------------------------------------------------ admin: invite providers
create or replace function public.invite_request_providers(_request_id uuid, _provider_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_verified_admin(auth.uid()) then raise exception 'Not allowed'; end if;
  insert into public.request_provider_invites (request_id, provider_id, invited_by)
    select _request_id, p.id, auth.uid() from public.service_providers p
     where p.id = any(_provider_ids) and p.status = 'active'
    on conflict (request_id, provider_id) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.request_events (request_id, kind, actor, detail)
      values (_request_id, 'providers_invited', 'admin', jsonb_build_object('count', n));
  end if;
  return n;
end $$;

-- ---------------------------------------------- provider: contact-free brief
create or replace function public.provider_request_brief(_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid; r jsonb;
begin
  select i.provider_id into pid from public.request_provider_invites i
    join public.service_providers p on p.id = i.provider_id
   where i.request_id = _request_id and p.owner_user_id = auth.uid()
   limit 1;
  if pid is null then return null; end if;

  update public.request_provider_invites set status = 'viewed', updated_at = now()
   where request_id = _request_id and provider_id = pid and status = 'invited';

  select jsonb_build_object(
    'id', sr.id, 'request_number', sr.request_number, 'created_at', sr.created_at,
    'status', sr.status, 'category_key', sr.service_category_key, 'services', sr.services,
    'notes', sr.notes, 'mileage', sr.mileage, 'zip_code', sr.zip_code,
    'location_type', sr.service_location_type, 'provider_id', pid,
    'vehicle', jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim),
    'build', case when b.id is null then null else jsonb_build_object(
      'name', b.name,
      'modifications', coalesce((select jsonb_agg(jsonb_build_object('item', m.item, 'category', m.category, 'detail', m.detail, 'notes', m.notes, 'status', m.status))
                                  from public.build_modifications m where m.build_id = b.id and m.status <> 'removed'), '[]'::jsonb)) end,
    'invite', (select to_jsonb(i) - 'invited_by' from public.request_provider_invites i where i.request_id = sr.id and i.provider_id = pid),
    'quotes', coalesce((select jsonb_agg(to_jsonb(q) order by q.version desc) from public.provider_quotes q where q.request_id = sr.id and q.provider_id = pid), '[]'::jsonb)
  ) into r
  from public.service_requests sr
  left join public.vehicles v on v.id = sr.vehicle_id
  left join public.vehicle_builds b on b.id = sr.build_id
  where sr.id = _request_id;
  return r;
end $$;

-- ------------------------------------------------- provider: submit quote
create or replace function public.submit_provider_quote(
  _request_id uuid, _parts integer, _labor integer, _fees integer, _tax integer,
  _notes text, _timeframe text, _warranty text
) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; v integer; qid uuid; owner uuid; total integer;
begin
  select i.provider_id into pid from public.request_provider_invites i
    join public.service_providers p on p.id = i.provider_id
   where i.request_id = _request_id and p.owner_user_id = auth.uid()
     and p.status = 'active' and i.status in ('invited','viewed','quoted')
   limit 1;
  if pid is null then raise exception 'You can''t quote this request'; end if;
  if least(_parts, _labor, _fees, _tax) < 0 then raise exception 'Amounts must be positive'; end if;
  total := coalesce(_parts,0) + coalesce(_labor,0) + coalesce(_fees,0) + coalesce(_tax,0);
  if total <= 0 then raise exception 'Enter the quote amounts'; end if;

  -- Serialize revisions from the same provider.
  perform 1 from public.request_provider_invites where request_id = _request_id and provider_id = pid for update;
  select coalesce(max(version), 0) + 1 into v from public.provider_quotes where request_id = _request_id and provider_id = pid;
  update public.provider_quotes set status = 'superseded'
   where request_id = _request_id and provider_id = pid and status = 'submitted';

  insert into public.provider_quotes (request_id, provider_id, version, parts_cents, labor_cents, fees_cents, tax_cents,
                                      total_cents, notes, timeframe, warranty, submitted_by)
  values (_request_id, pid, v, coalesce(_parts,0), coalesce(_labor,0), coalesce(_fees,0), coalesce(_tax,0),
          total, nullif(trim(_notes), ''), nullif(trim(_timeframe), ''), nullif(trim(_warranty), ''), auth.uid())
  returning id into qid;

  update public.request_provider_invites set status = 'quoted', updated_at = now()
   where request_id = _request_id and provider_id = pid;

  perform set_config('repara.trusted', 'on', true);
  update public.build_modifications set status = 'quoted'
   where service_request_id = _request_id and status = 'requested';

  insert into public.request_events (request_id, kind, actor, provider_id, detail)
    values (_request_id, case when v = 1 then 'quote_submitted' else 'quote_revised' end, 'provider', pid,
            jsonb_build_object('version', v, 'total_cents', total));

  select user_id into owner from public.service_requests where id = _request_id;
  if owner is not null then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    values (owner, 'quote_received', case when v = 1 then 'You received a quote' else 'A quote was updated' end,
            'A provider sent pricing for your request.', '/garage/request/' || _request_id, 'quote:' || qid)
    on conflict do nothing;
  end if;
  return qid;
end $$;

-- --------------------------------------------------- provider: decline
create or replace function public.decline_provider_invite(_request_id uuid, _reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select i.provider_id into pid from public.request_provider_invites i
    join public.service_providers p on p.id = i.provider_id
   where i.request_id = _request_id and p.owner_user_id = auth.uid() and i.status in ('invited','viewed','quoted')
   limit 1;
  if pid is null then return false; end if;
  update public.request_provider_invites set status = 'declined', decline_reason = nullif(trim(_reason), ''), updated_at = now()
   where request_id = _request_id and provider_id = pid;
  update public.provider_quotes set status = 'withdrawn'
   where request_id = _request_id and provider_id = pid and status = 'submitted';
  insert into public.request_events (request_id, kind, actor, provider_id) values (_request_id, 'provider_declined', 'provider', pid);
  return true;
end $$;

-- ------------------------------------------------ customer: accept/decline
create or replace function public.respond_to_provider_quote(_quote_id uuid, _action text)
returns boolean language plpgsql security definer set search_path = public as $$
declare q public.provider_quotes;
begin
  if _action not in ('accept','decline') then raise exception 'Unknown action'; end if;
  select * into q from public.provider_quotes where id = _quote_id for update;
  if q.id is null or not public.owns_request(q.request_id) then raise exception 'Not allowed'; end if;
  if q.status <> 'submitted' then raise exception 'This quote can no longer be changed'; end if;

  if _action = 'decline' then
    update public.provider_quotes set status = 'declined', responded_at = now() where id = q.id;
    insert into public.request_events (request_id, kind, actor, provider_id, detail)
      values (q.request_id, 'quote_declined', 'customer', q.provider_id, jsonb_build_object('version', q.version));
    return true;
  end if;

  if exists (select 1 from public.provider_quotes where request_id = q.request_id and status = 'accepted') then
    raise exception 'A quote was already approved for this request';
  end if;

  update public.provider_quotes set status = 'accepted', responded_at = now() where id = q.id;
  update public.request_provider_invites set status = 'selected', updated_at = now()
   where request_id = q.request_id and provider_id = q.provider_id;
  update public.request_provider_invites set status = 'not_selected', updated_at = now()
   where request_id = q.request_id and provider_id <> q.provider_id and status in ('invited','viewed','quoted');
  -- The selected provider becomes the assigned provider (existing job access).
  update public.service_requests set provider_id = q.provider_id, updated_at = now() where id = q.request_id;

  perform set_config('repara.trusted', 'on', true);
  update public.build_modifications set status = 'approved'
   where service_request_id = q.request_id and status in ('requested','quoted');

  insert into public.request_events (request_id, kind, actor, provider_id, detail)
    values (q.request_id, 'quote_approved', 'customer', q.provider_id, jsonb_build_object('version', q.version, 'total_cents', q.total_cents));
  return true;
end $$;

revoke all on function public.invite_request_providers(uuid, uuid[]) from public, anon;
revoke all on function public.provider_request_brief(uuid) from public, anon;
revoke all on function public.submit_provider_quote(uuid, integer, integer, integer, integer, text, text, text) from public, anon;
revoke all on function public.decline_provider_invite(uuid, text) from public, anon;
revoke all on function public.respond_to_provider_quote(uuid, text) from public, anon;
grant execute on function public.invite_request_providers(uuid, uuid[]) to authenticated;
grant execute on function public.provider_request_brief(uuid) to authenticated;
grant execute on function public.submit_provider_quote(uuid, integer, integer, integer, integer, text, text, text) to authenticated;
grant execute on function public.decline_provider_invite(uuid, text) to authenticated;
grant execute on function public.respond_to_provider_quote(uuid, text) to authenticated;

-- Existing requests with a chosen provider get their invite now.
insert into public.request_provider_invites (request_id, provider_id)
  select sr.id, sr.provider_id from public.service_requests sr
    join public.service_providers p on p.id = sr.provider_id and p.status = 'active'
  on conflict (request_id, provider_id) do nothing;
