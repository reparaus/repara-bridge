-- 0023 — Request notifications, request-specific messaging, provider
-- workspace, preset pricing and the "appointment pending" hand-off.
-- Additive and re-run safe. Requires 0017, 0020 and 0021.
--
-- Reuses: notifications (0017), request_provider_invites / provider_quotes /
-- request_events (0020), provider_services (0015), appointments (0001) and
-- profiles.notification_preferences (0014). No second request, quote or
-- provider system is created.

-- ============================================================ notifications
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists audience text not null default 'driver';
do $$ begin
  alter table public.notifications add constraint notifications_audience_chk check (audience in ('driver','provider'));
exception when duplicate_object then null; end $$;
create index if not exists idx_notifications_user_audience
  on public.notifications(user_id, audience, created_at desc);

-- Every notification gets a real destination. Provider events open the
-- provider request page, everything else the driver's request / vehicle.
create or replace function public.notifications_fill_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.event_type like 'provider_%' then
    new.audience := 'provider';
  end if;
  if new.link is null then
    if new.audience = 'provider' and new.service_request_id is not null then
      new.link := '/provider/project/' || new.service_request_id;
    elsif new.service_request_id is not null then
      new.link := '/garage/request/' || new.service_request_id;
    elsif new.vehicle_id is not null then
      new.link := '/garage/vehicle/' || new.vehicle_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists notifications_fill_defaults on public.notifications;
create trigger notifications_fill_defaults before insert on public.notifications
  for each row execute function public.notifications_fill_defaults();

update public.notifications set link = '/garage/request/' || service_request_id
 where link is null and service_request_id is not null and audience = 'driver';

-- ---------------------------------------------------- delivery log (email/sms)
-- One row per attempted out-of-app delivery. Channel is open-ended so SMS can
-- be added later without changing the model. dedupe_key blocks duplicates.
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  channel text not null default 'email' check (channel in ('email','sms','push')),
  notification_id uuid references public.notifications(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete cascade,
  event_type text not null,
  audience text not null check (audience in ('driver','provider','guest')),
  status text not null check (status in ('sent','failed','skipped_pref','skipped_no_address')),
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_deliveries_request
  on public.notification_deliveries(service_request_id, created_at desc);

grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;
alter table public.notification_deliveries enable row level security;
drop policy if exists "verified admins read deliveries" on public.notification_deliveries;
create policy "verified admins read deliveries" on public.notification_deliveries
  for select to authenticated using (public.is_verified_admin(auth.uid()));

-- ====================================================== guest request access
-- Request-scoped guest link. Only the SHA-256 hash is stored; the raw token
-- lives in the customer's link. Nobody but the service role can read it, and
-- a token resolves to exactly one request (no enumeration).
create table if not exists public.request_access_tokens (
  token_hash text primary key,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '180 days'),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_request_access_tokens_request on public.request_access_tokens(service_request_id);
revoke all on public.request_access_tokens from anon, authenticated;
grant all on public.request_access_tokens to service_role;
alter table public.request_access_tokens enable row level security;

-- ============================================================== messaging
-- A conversation is (request, provider). Customer ↔ that provider only.
create table if not exists public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','provider','admin')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_request_messages_conv on public.request_messages(request_id, provider_id, created_at);

-- Reads only; writes go through post_request_message.
grant select on public.request_messages to authenticated;
grant all on public.request_messages to service_role;
alter table public.request_messages enable row level security;

drop policy if exists "message parties read" on public.request_messages;
create policy "message parties read" on public.request_messages for select to authenticated
  using (
    public.owns_request(request_id)
    or public.owns_provider(provider_id)
    or public.is_verified_admin(auth.uid())
  );

-- Core write path, service role only. Callers have already authorized the
-- sender (authenticated wrapper below, or the guest-token server function).
create or replace function public.post_request_message(
  _request_id uuid, _provider_id uuid, _sender_role text, _sender_user uuid, _body text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare mid uuid; nid uuid; owner uuid; prov_owner uuid; veh text; pname text; reqnum text;
begin
  if _sender_role not in ('customer','provider') then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(_body,''))) = 0 then raise exception 'Write a message first'; end if;
  if char_length(_body) > 2000 then raise exception 'Message is too long'; end if;
  if not exists (select 1 from public.request_provider_invites where request_id = _request_id and provider_id = _provider_id) then
    raise exception 'This conversation is not available';
  end if;

  insert into public.request_messages (request_id, provider_id, sender_role, sender_user_id, body)
  values (_request_id, _provider_id, _sender_role, _sender_user, trim(_body))
  returning id into mid;

  select sr.user_id, sr.request_number, concat_ws(' ', v.year, v.make, v.model)
    into owner, reqnum, veh
    from public.service_requests sr left join public.vehicles v on v.id = sr.vehicle_id
   where sr.id = _request_id;
  select owner_user_id, business_name into prov_owner, pname from public.service_providers where id = _provider_id;

  if _sender_role = 'customer' and prov_owner is not null then
    insert into public.notifications (user_id, service_request_id, provider_id, event_type, event_key, title, body)
    values (prov_owner, _request_id, _provider_id, 'provider_message', 'msg:' || mid,
            'New message from a customer', coalesce(nullif(veh,''), 'Request #' || reqnum))
    on conflict (user_id, event_key) do nothing returning id into nid;
  elsif _sender_role = 'provider' and owner is not null then
    insert into public.notifications (user_id, service_request_id, provider_id, event_type, event_key, title, body)
    values (owner, _request_id, _provider_id, 'message_received', 'msg:' || mid,
            'New message from ' || coalesce(pname, 'your provider'), coalesce(nullif(veh,''), 'Request #' || reqnum))
    on conflict (user_id, event_key) do nothing returning id into nid;
  end if;

  return jsonb_build_object('message_id', mid, 'notification_id', nid, 'guest_recipient', _sender_role = 'provider' and owner is null);
end $$;
revoke all on function public.post_request_message(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.post_request_message(uuid, uuid, text, uuid, text) to service_role;

-- Signed-in sender: role decided from the caller, never from the client.
create or replace function public.send_request_message(_request_id uuid, _provider_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.owns_request(_request_id) then
    return public.post_request_message(_request_id, _provider_id, 'customer', auth.uid(), _body);
  elsif public.owns_provider(_provider_id) then
    return public.post_request_message(_request_id, _provider_id, 'provider', auth.uid(), _body);
  end if;
  raise exception 'This conversation is not available';
end $$;
revoke all on function public.send_request_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_request_message(uuid, uuid, text) to authenticated;

-- Marks the other party's messages as read for the caller.
create or replace function public.mark_request_messages_read(_request_id uuid, _provider_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer; role text;
begin
  if public.owns_request(_request_id) then role := 'customer';
  elsif public.owns_provider(_provider_id) then role := 'provider';
  else return 0; end if;
  update public.request_messages set read_at = now()
   where request_id = _request_id and provider_id = _provider_id
     and sender_role <> role and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_request_messages_read(uuid, uuid) from public, anon;
grant execute on function public.mark_request_messages_read(uuid, uuid) to authenticated;

-- ============================================== provider preset pricing
alter table public.provider_services add column if not exists is_active boolean not null default true;
alter table public.provider_services add column if not exists pricing_mode text not null default 'quote';
alter table public.provider_services add column if not exists price_cents integer;
alter table public.provider_services add column if not exists price_max_cents integer;
alter table public.provider_services add column if not exists duration_minutes integer;
alter table public.provider_services add column if not exists notes text;
alter table public.provider_services add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.provider_services add constraint provider_services_pricing_chk check (
    pricing_mode in ('fixed','starting_at','range','quote')
    and (price_cents is null or price_cents between 0 and 100000000)
    and (price_max_cents is null or price_max_cents between 0 and 100000000)
    and (duration_minutes is null or duration_minutes between 0 and 10080)
    and (notes is null or char_length(notes) <= 500)
  );
exception when duplicate_object then null; end $$;

grant update on public.provider_services to authenticated;
drop policy if exists "provider owner updates own services" on public.provider_services;
create policy "provider owner updates own services" on public.provider_services
  for update to authenticated using (public.owns_provider(provider_id))
  with check (public.owns_provider(provider_id));

-- ================================================ provider request matching
-- Invites active, non-demo providers that actively offer the requested
-- category AND explicitly serve the request ZIP area (first 3 digits of the
-- provider or one of its service areas). Never a broadcast. Service role only.
create or replace function public.match_request_providers(_request_id uuid, _limit integer default 10)
returns integer language plpgsql security definer set search_path = public as $$
declare cat text; zip3 text; n integer;
begin
  select service_category_key, left(regexp_replace(coalesce(zip_code,''), '\D', '', 'g'), 3)
    into cat, zip3 from public.service_requests where id = _request_id;
  if cat is null or cat = 'other' or char_length(zip3) <> 3 then return 0; end if;

  insert into public.request_provider_invites (request_id, provider_id)
    select _request_id, p.id from public.service_providers p
     where p.status::text = 'active' and not coalesce(p.is_demo, false)
       and exists (select 1 from public.provider_services s where s.provider_id = p.id and s.category_key = cat and s.is_active)
       and (left(regexp_replace(coalesce(p.postal_code,''), '\D', '', 'g'), 3) = zip3
            or exists (select 1 from public.provider_service_areas a where a.provider_id = p.id
                        and left(regexp_replace(coalesce(a.postal_code,''), '\D', '', 'g'), 3) = zip3))
     order by p.created_at
     limit greatest(1, least(_limit, 20))
    on conflict (request_id, provider_id) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.request_events (request_id, kind, actor, detail)
      values (_request_id, 'providers_invited', 'system', jsonb_build_object('count', n));
  end if;
  return n;
end $$;
revoke all on function public.match_request_providers(uuid, integer) from public, anon, authenticated;
grant execute on function public.match_request_providers(uuid, integer) to service_role;

-- Every new invite (auto-match, driver-chosen, admin) notifies the provider once.
create or replace function public.notify_provider_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; veh text; svc text;
begin
  select owner_user_id into owner from public.service_providers where id = new.provider_id;
  if owner is null then return new; end if;
  select concat_ws(' ', v.year, v.make, v.model, v.trim), coalesce(c.label_en, sr.service_category_key)
    into veh, svc
    from public.service_requests sr
    left join public.vehicles v on v.id = sr.vehicle_id
    left join public.service_categories c on c.key = sr.service_category_key
   where sr.id = new.request_id;
  insert into public.notifications (user_id, service_request_id, provider_id, event_type, event_key, title, body)
  values (owner, new.request_id, new.provider_id, 'provider_new_request', 'invite:' || new.request_id || ':' || new.provider_id,
          'New service request', concat_ws(' — ', nullif(veh, ''), svc))
  on conflict (user_id, event_key) do nothing;
  return new;
end $$;
drop trigger if exists notify_provider_invite on public.request_provider_invites;
create trigger notify_provider_invite after insert on public.request_provider_invites
  for each row execute function public.notify_provider_invite();

-- ================================================== provider request list
-- One call for the provider workspace. Unlike provider_request_brief it does
-- NOT mark invites viewed, and it stays contact-free.
create or replace function public.provider_request_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'invited_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'request_id', sr.id, 'request_number', sr.request_number, 'created_at', sr.created_at,
      'invited_at', i.created_at, 'invite_status', i.status, 'request_status', sr.status,
      'category_key', sr.service_category_key, 'mileage', sr.mileage,
      'concern', left(coalesce(sr.notes, ''), 160),
      'vehicle', concat_ws(' ', v.year, v.make, v.model, v.trim),
      'build_name', b.name,
      'customer_label', case when sr.user_id is null then 'Guest customer' else 'Repara driver' end,
      'quote_status', (select q.status from public.provider_quotes q where q.request_id = sr.id and q.provider_id = p.id
                        and q.status <> 'superseded' order by q.version desc limit 1),
      'unread', (select count(*) from public.request_messages m where m.request_id = sr.id and m.provider_id = p.id
                  and m.sender_role = 'customer' and m.read_at is null),
      'appointment_status', (select a.status from public.appointments a where a.service_request_id = sr.id order by a.created_at desc limit 1)
    ) as x
    from public.service_providers p
    join public.request_provider_invites i on i.provider_id = p.id
    join public.service_requests sr on sr.id = i.request_id
    left join public.vehicles v on v.id = sr.vehicle_id
    left join public.vehicle_builds b on b.id = sr.build_id
    where p.owner_user_id = auth.uid()
    order by i.created_at desc
    limit 200
  ) t;
$$;
revoke all on function public.provider_request_list() from public, anon;
grant execute on function public.provider_request_list() to authenticated;

-- ========================================= quote accepted → appointment pending
-- Wraps the 0020 logic so signed-in drivers and guest links share one path.
create or replace function public.apply_quote_response(_quote_id uuid, _action text, _actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.provider_quotes; sr public.service_requests; owner uuid; nid uuid; veh text;
begin
  if _action not in ('accept','decline') then raise exception 'Unknown action'; end if;
  select * into q from public.provider_quotes where id = _quote_id for update;
  if q.id is null then raise exception 'Not allowed'; end if;
  if q.status <> 'submitted' then raise exception 'This quote can no longer be changed'; end if;

  if _action = 'decline' then
    update public.provider_quotes set status = 'declined', responded_at = now() where id = q.id;
    insert into public.request_events (request_id, kind, actor, provider_id, detail)
      values (q.request_id, 'quote_declined', 'customer', q.provider_id, jsonb_build_object('version', q.version, 'via', _actor));
    return jsonb_build_object('ok', true);
  end if;

  if exists (select 1 from public.provider_quotes where request_id = q.request_id and status = 'accepted') then
    raise exception 'A quote was already approved for this request';
  end if;

  update public.provider_quotes set status = 'accepted', responded_at = now() where id = q.id;
  update public.request_provider_invites set status = 'selected', updated_at = now()
   where request_id = q.request_id and provider_id = q.provider_id;
  update public.request_provider_invites set status = 'not_selected', updated_at = now()
   where request_id = q.request_id and provider_id <> q.provider_id and status in ('invited','viewed','quoted');
  update public.service_requests
     set provider_id = q.provider_id,
         status = case when status::text in ('new','reviewing','quoted') then 'accepted'::public.request_status else status end,
         updated_at = now()
   where id = q.request_id
  returning * into sr;

  perform set_config('repara.trusted', 'on', true);
  update public.build_modifications set status = 'approved'
   where service_request_id = q.request_id and status in ('requested','quoted');

  -- Appointment Pending: the scheduling feature will fill in the time slot.
  if sr.customer_id is not null and sr.vehicle_id is not null
     and not exists (select 1 from public.appointments where service_request_id = sr.id and status in ('pending','scheduled')) then
    insert into public.appointments (service_request_id, customer_id, vehicle_id, status)
    values (sr.id, sr.customer_id, sr.vehicle_id, 'pending');
  end if;

  insert into public.request_events (request_id, kind, actor, provider_id, detail)
    values (q.request_id, 'quote_approved', 'customer', q.provider_id, jsonb_build_object('version', q.version, 'total_cents', q.total_cents, 'via', _actor)),
           (q.request_id, 'appointment_pending', 'system', q.provider_id, '{}'::jsonb);

  select owner_user_id into owner from public.service_providers where id = q.provider_id;
  select concat_ws(' ', v.year, v.make, v.model) into veh from public.vehicles v where v.id = sr.vehicle_id;
  if owner is not null then
    insert into public.notifications (user_id, service_request_id, provider_id, event_type, event_key, title, body)
    values (owner, q.request_id, q.provider_id, 'provider_quote_accepted', 'accepted:' || q.id,
            'Quote accepted', concat_ws(' — ', nullif(veh, ''), 'Appointment pending'))
    on conflict (user_id, event_key) do nothing returning id into nid;
  end if;
  return jsonb_build_object('ok', true, 'notification_id', nid);
end $$;
revoke all on function public.apply_quote_response(uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_quote_response(uuid, text, text) to service_role;

create or replace function public.respond_to_provider_quote(_quote_id uuid, _action text)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select request_id into rid from public.provider_quotes where id = _quote_id;
  if rid is null or not public.owns_request(rid) then raise exception 'Not allowed'; end if;
  perform public.apply_quote_response(_quote_id, _action, 'account');
  return true;
end $$;
revoke all on function public.respond_to_provider_quote(uuid, text) from public, anon;
grant execute on function public.respond_to_provider_quote(uuid, text) to authenticated;

-- Providers read the appointment placeholder for requests they were selected on.
grant select on public.appointments to authenticated;
drop policy if exists "assigned provider reads appointments" on public.appointments;
create policy "assigned provider reads appointments" on public.appointments for select to authenticated
  using (public.is_request_provider(service_request_id));

-- ======================================= request status → driver notification
create or replace function public.notify_request_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and new.status is distinct from old.status then
    insert into public.notifications (user_id, service_request_id, vehicle_id, event_type, event_key, title, body)
    values (new.user_id, new.id, new.vehicle_id, 'request_status', 'status:' || new.id || ':' || new.status,
            'Request update', 'Request #' || new.request_number || ' is now ' || replace(new.status::text, '_', ' ') || '.')
    on conflict (user_id, event_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists notify_request_status on public.service_requests;
create trigger notify_request_status after update of status on public.service_requests
  for each row execute function public.notify_request_status();
