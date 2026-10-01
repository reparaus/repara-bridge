-- ============================================================================
-- Repara — 0026 PROVIDER QUOTE LINES + SUPPLIER-NEUTRAL PARTS
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Does NOT touch 0025 or provider matching.
--
--   * service_providers.labor_rate_cents   optional hourly labor rate
--   * provider_quotes.labor_hours / fitment_confirmed_at
--   * provider_quote_items                 part / labor / fee lines per quote
--       - provider cost + supplier fields are visible ONLY to the owning
--         provider and verified admins (RLS on the table)
--       - customers read lines through provider_quote_customer_items(),
--         which returns name / quantity / customer price only
--   * parts_suppliers + part_offers        empty, supplier-neutral structure a
--       future authorized integration (PartsTech, Nexpart, WHI, AutoZone,
--       O'Reilly …) can populate server-side. No prices are seeded.
--   * submit_provider_quote_lines()        computes totals from lines and
--       reuses submit_provider_quote() so versioning/notifications are unchanged
--   * provider_request_brief()             adds engine / fuel / drivetrain.
--       The VIN is intentionally NOT included.
-- ============================================================================

-- --------------------------------------------------------- provider settings
alter table public.service_providers
  add column if not exists labor_rate_cents integer check (labor_rate_cents is null or (labor_rate_cents >= 0 and labor_rate_cents <= 10000000));

-- -------------------------------------------------------------- quote header
alter table public.provider_quotes
  add column if not exists labor_hours numeric check (labor_hours is null or labor_hours >= 0),
  add column if not exists fitment_confirmed_at timestamptz;

-- ------------------------------------------------- supplier-neutral catalog
create table if not exists public.parts_suppliers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                -- e.g. 'partstech', 'nexpart', 'manual'
  name text not null,
  integration_kind text not null default 'manual' check (integration_kind in ('manual','api','partner')),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.part_offers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.parts_suppliers(id) on delete cascade,
  supplier_part_id text,
  part_number text,
  brand text,
  name text not null,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  currency text not null default 'USD',
  availability text,
  store_location text,
  price_checked_at timestamptz,
  fitment jsonb not null default '{}'::jsonb,   -- supplier-reported fitment (vehicle keys, notes)
  source text,
  created_at timestamptz not null default now()
);
create index if not exists part_offers_part_number_idx on public.part_offers (part_number);

grant select on public.parts_suppliers, public.part_offers to authenticated;
grant all on public.parts_suppliers, public.part_offers to service_role;
alter table public.parts_suppliers enable row level security;
alter table public.part_offers enable row level security;

-- Only admins and owners of a provider profile may read offers; writes are service-role only.
drop policy if exists "providers read suppliers" on public.parts_suppliers;
create policy "providers read suppliers" on public.parts_suppliers for select to authenticated
  using (public.is_verified_admin(auth.uid()) or exists (select 1 from public.service_providers p where p.owner_user_id = auth.uid()));
drop policy if exists "providers read offers" on public.part_offers;
create policy "providers read offers" on public.part_offers for select to authenticated
  using (public.is_verified_admin(auth.uid()) or exists (select 1 from public.service_providers p where p.owner_user_id = auth.uid()));

-- --------------------------------------------------------- quote line items
create table if not exists public.provider_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.provider_quotes(id) on delete cascade,
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  kind text not null check (kind in ('part','labor','fee')),
  sort_order integer not null default 0,
  name text not null check (char_length(name) between 1 and 200),
  quantity numeric not null default 1 check (quantity > 0 and quantity <= 10000),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  -- PROVIDER-PRIVATE fields (never returned to customers)
  brand text,
  part_number text,
  provider_unit_cost_cents integer check (provider_unit_cost_cents is null or provider_unit_cost_cents >= 0),
  supplier text,
  supplier_part_id text,
  part_offer_id uuid references public.part_offers(id) on delete set null,
  labor_hours numeric check (labor_hours is null or labor_hours >= 0),
  labor_rate_cents integer check (labor_rate_cents is null or labor_rate_cents >= 0),
  fitment_status text not null default 'unverified' check (fitment_status in ('unverified','provider_confirmed','verified')),
  created_at timestamptz not null default now()
);
create index if not exists provider_quote_items_quote_idx on public.provider_quote_items (quote_id, sort_order);

grant select on public.provider_quote_items to authenticated;
grant all on public.provider_quote_items to service_role;
alter table public.provider_quote_items enable row level security;

-- Owning provider + verified admins only. Customers have NO direct access.
drop policy if exists "quote items provider read" on public.provider_quote_items;
create policy "quote items provider read" on public.provider_quote_items for select to authenticated
  using (public.owns_provider(provider_id) or public.is_verified_admin(auth.uid()));

-- Customer-safe projection: name, kind, quantity, customer price.
create or replace function public.provider_quote_customer_items(_quote_ids uuid[])
returns table (quote_id uuid, kind text, name text, quantity numeric, unit_price_cents integer, line_total_cents integer, sort_order integer)
language sql stable security definer set search_path = public as $$
  select i.quote_id, i.kind, i.name, i.quantity, i.unit_price_cents, i.line_total_cents, i.sort_order
    from public.provider_quote_items i
    join public.provider_quotes q on q.id = i.quote_id
   where i.quote_id = any(_quote_ids)
     and (coalesce(auth.role(), '') = 'service_role'
          or public.owns_request(q.request_id)
          or public.owns_provider(q.provider_id)
          or public.is_verified_admin(auth.uid()))
   order by i.quote_id, i.sort_order
$$;
revoke all on function public.provider_quote_customer_items(uuid[]) from public, anon;
grant execute on function public.provider_quote_customer_items(uuid[]) to authenticated, service_role;

-- ------------------------------------------------ submit quote with lines
-- _items: [{kind, name, quantity, unit_price_cents, brand?, part_number?,
--           provider_unit_cost_cents?, supplier?, labor_hours?, labor_rate_cents?}]
create or replace function public.submit_provider_quote_lines(
  _request_id uuid, _items jsonb, _tax integer, _notes text, _timeframe text, _warranty text, _fitment_confirmed boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  it jsonb; qid uuid; pid uuid; n integer := 0;
  parts integer := 0; labor integer := 0; fees integer := 0; hours numeric := 0;
  qty numeric; price integer; line integer; has_parts boolean := false;
begin
  if jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'Enter the quote amounts'; end if;
  if jsonb_array_length(_items) > 60 then raise exception 'Too many quote lines'; end if;

  for it in select * from jsonb_array_elements(_items) loop
    qty := coalesce((it->>'quantity')::numeric, 1);
    price := coalesce((it->>'unit_price_cents')::integer, 0);
    if qty <= 0 or price < 0 then raise exception 'Amounts must be positive'; end if;
    line := round(qty * price);
    case it->>'kind'
      when 'part' then parts := parts + line; has_parts := true;
      when 'labor' then labor := labor + line; hours := hours + coalesce((it->>'labor_hours')::numeric, 0);
      when 'fee' then fees := fees + line;
      else raise exception 'Unknown line type';
    end case;
  end loop;

  if has_parts and not coalesce(_fitment_confirmed, false) then
    raise exception 'Confirm part fitment before sending';
  end if;

  -- Reuse the existing submission: authorization, versioning, events, notifications.
  qid := public.submit_provider_quote(_request_id, parts, labor, fees, coalesce(_tax, 0), _notes, _timeframe, _warranty);
  select provider_id into pid from public.provider_quotes where id = qid;

  update public.provider_quotes
     set labor_hours = nullif(hours, 0),
         fitment_confirmed_at = case when has_parts then now() else null end
   where id = qid;

  for it in select * from jsonb_array_elements(_items) loop
    qty := coalesce((it->>'quantity')::numeric, 1);
    price := coalesce((it->>'unit_price_cents')::integer, 0);
    insert into public.provider_quote_items (
      quote_id, provider_id, kind, sort_order, name, quantity, unit_price_cents, line_total_cents,
      brand, part_number, provider_unit_cost_cents, supplier, labor_hours, labor_rate_cents, fitment_status)
    values (
      qid, pid, it->>'kind', n, left(coalesce(nullif(trim(it->>'name'), ''), initcap(it->>'kind')), 200), qty, price, round(qty * price),
      nullif(left(trim(coalesce(it->>'brand', '')), 120), ''),
      nullif(left(trim(coalesce(it->>'part_number', '')), 120), ''),
      nullif(it->>'provider_unit_cost_cents', '')::integer,
      nullif(left(trim(coalesce(it->>'supplier', '')), 120), ''),
      nullif(it->>'labor_hours', '')::numeric,
      nullif(it->>'labor_rate_cents', '')::integer,
      case when it->>'kind' = 'part' then 'provider_confirmed' else 'unverified' end);
    n := n + 1;
  end loop;
  return qid;
end $$;
revoke all on function public.submit_provider_quote_lines(uuid, jsonb, integer, text, text, text, boolean) from public, anon;
grant execute on function public.submit_provider_quote_lines(uuid, jsonb, integer, text, text, text, boolean) to authenticated;

-- ------------------------------------- provider brief: add engine context
-- Same as 0020 plus engine/fuel/drivetrain/body. VIN is deliberately omitted.
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
    'vehicle', jsonb_build_object('year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim,
                                  'engine_displacement', v.engine_displacement, 'cylinder_count', v.cylinder_count,
                                  'engine_code', v.engine_code, 'fuel_type', v.fuel_type, 'is_hybrid', v.is_hybrid,
                                  'drivetrain', v.drivetrain, 'body_type', v.body_type),
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
revoke all on function public.provider_request_brief(uuid) from public, anon;
grant execute on function public.provider_request_brief(uuid) to authenticated;
