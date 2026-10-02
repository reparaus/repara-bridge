-- ============================================================================
-- Repara — 0027 LABOR ESTIMATING + PROVIDER PRICING DEFAULTS
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Builds on 0026 (does not modify its tables'
-- existing columns). Does NOT touch 0025 or provider matching.
--
--   * service_providers: default warranty / shop supplies / disposal fee
--   * repair_operations         catalog of repair operations (names only —
--                               NO labor times are seeded)
--   * labor_time_estimates      source-tagged, vehicle-applicable labor times
--                               (reference / licensed / repara_observed).
--                               Empty. Written only server-side by an
--                               authorized integration or admin import.
--   * provider_labor_defaults   a provider's own default hours per operation
--   * provider_quote_items      + operation_key / labor_time_source /
--                                 suggested_labor_hours
--   * labor_observations        future real-world labor feedback per job
--   * submit_provider_quote_lines() redefined to persist the new labor fields;
--     totals, versioning and notifications still go through
--     submit_provider_quote() exactly as in 0026.
-- ============================================================================

-- ------------------------------------------------------ provider defaults
alter table public.service_providers
  add column if not exists default_warranty text check (default_warranty is null or char_length(default_warranty) <= 500),
  add column if not exists default_shop_supplies_cents integer check (default_shop_supplies_cents is null or (default_shop_supplies_cents >= 0 and default_shop_supplies_cents <= 10000000)),
  add column if not exists default_disposal_fee_cents integer check (default_disposal_fee_cents is null or (default_disposal_fee_cents >= 0 and default_disposal_fee_cents <= 10000000));

-- ------------------------------------------------------ operation catalog
create table if not exists public.repair_operations (
  key text primary key,
  name text not null,
  category_keys text[] not null default '{}',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.repair_operations to authenticated;
grant all on public.repair_operations to service_role;
alter table public.repair_operations enable row level security;
drop policy if exists "read operations" on public.repair_operations;
create policy "read operations" on public.repair_operations for select to authenticated using (is_active);

-- Names only. No hours are implied by this list.
insert into public.repair_operations (key, name, category_keys, sort_order) values
  ('oil_filter_service',        'Oil & Filter Service',                 '{oil_service,preventive_maintenance,maintenance}', 10),
  ('front_pads',                'Front Brake Pads',                     '{brakes}', 20),
  ('front_pads_rotors',         'Front Brake Pads + Rotors',            '{brakes}', 21),
  ('front_pads_rotor_resurface','Front Brake Pads + Rotor Resurfacing', '{brakes}', 22),
  ('rear_pads',                 'Rear Brake Pads',                      '{brakes}', 23),
  ('rear_pads_rotors',          'Rear Brake Pads + Rotors',             '{brakes}', 24),
  ('brake_fluid_flush',         'Brake Fluid Flush',                    '{brakes,fluid_service}', 25),
  ('spark_plugs',               'Spark Plug Replacement',               '{maintenance,preventive_maintenance}', 30),
  ('engine_air_filter',         'Engine Air Filter Replacement',        '{maintenance,filters,preventive_maintenance}', 31),
  ('cabin_air_filter',          'Cabin Air Filter Replacement',         '{maintenance,filters,ac,preventive_maintenance}', 32),
  ('battery_replacement',       'Battery Replacement',                  '{battery,starting_charging}', 40),
  ('alternator_replacement',    'Alternator Replacement',               '{starting_charging,battery}', 41),
  ('starter_replacement',       'Starter Replacement',                  '{starting_charging}', 42),
  ('coolant_service',           'Coolant Service',                      '{cooling,overheating,fluid_service}', 50),
  ('water_pump_replacement',    'Water Pump Replacement',               '{cooling,overheating}', 51),
  ('thermostat_replacement',    'Thermostat Replacement',               '{cooling,overheating}', 52),
  ('transmission_fluid_service','Transmission Fluid Service',           '{transmission,fluid_service}', 60),
  ('diagnostic',                'Diagnostic / Inspection',              '{diagnostics,other}', 90)
on conflict (key) do nothing;

-- -------------------------------------------- source-tagged labor times
create table if not exists public.labor_time_estimates (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null references public.repair_operations(key) on delete cascade,
  source_type text not null check (source_type in ('reference','licensed','repara_observed')),
  source_name text not null,                 -- e.g. the licensed provider or dataset name
  source_ref text,                           -- external id / dataset version
  is_warranty_time boolean not null default false,  -- warranty/OEM op time, never treated as customer-pay truth
  is_test_data boolean not null default false,      -- dev/demo rows, labelled as such in the UI
  year_from integer, year_to integer,
  make text, model text, trim text, engine text, drivetrain text,
  hours numeric not null check (hours > 0 and hours <= 200),
  sample_size integer,                       -- for repara_observed averages
  retrieved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists labor_time_estimates_op_idx on public.labor_time_estimates (operation_key, make, model);
grant select on public.labor_time_estimates to authenticated;
grant all on public.labor_time_estimates to service_role;
alter table public.labor_time_estimates enable row level security;
drop policy if exists "providers read labor times" on public.labor_time_estimates;
create policy "providers read labor times" on public.labor_time_estimates for select to authenticated
  using (public.is_verified_admin(auth.uid()) or exists (select 1 from public.service_providers p where p.owner_user_id = auth.uid()));

-- ---------------------------------------------- provider's own defaults
create table if not exists public.provider_labor_defaults (
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  operation_key text not null references public.repair_operations(key) on delete cascade,
  hours numeric not null check (hours > 0 and hours <= 200),
  updated_at timestamptz not null default now(),
  primary key (provider_id, operation_key)
);
grant select, insert, update, delete on public.provider_labor_defaults to authenticated;
grant all on public.provider_labor_defaults to service_role;
alter table public.provider_labor_defaults enable row level security;
drop policy if exists "own labor defaults" on public.provider_labor_defaults;
create policy "own labor defaults" on public.provider_labor_defaults for all to authenticated
  using (public.owns_provider(provider_id)) with check (public.owns_provider(provider_id));

-- ------------------------------------------------- quote line labor info
alter table public.provider_quote_items
  add column if not exists operation_key text references public.repair_operations(key) on delete set null,
  add column if not exists labor_time_source text check (labor_time_source is null or labor_time_source in ('reference','licensed','repara_observed','provider_default','manual')),
  add column if not exists suggested_labor_hours numeric check (suggested_labor_hours is null or suggested_labor_hours >= 0);

-- ---------------------------------- future real-world labor intelligence
create table if not exists public.labor_observations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  quote_item_id uuid references public.provider_quote_items(id) on delete set null,
  request_id uuid references public.service_requests(id) on delete set null,
  operation_key text references public.repair_operations(key) on delete set null,
  vehicle jsonb not null default '{}'::jsonb,   -- year/make/model/trim/engine/drivetrain (no VIN)
  estimated_hours numeric check (estimated_hours is null or estimated_hours >= 0),
  actual_hours numeric check (actual_hours is null or actual_hours >= 0),
  accuracy text check (accuracy is null or accuracy in ('too_low','about_right','too_high')),
  difficulty smallint check (difficulty is null or difficulty between 1 and 5),
  modifiers text[] not null default '{}',       -- rust, seized_hardware, extra_disassembly, difficult_access, unexpected_issue, other
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  created_at timestamptz not null default now()
);
grant select, insert on public.labor_observations to authenticated;
grant all on public.labor_observations to service_role;
alter table public.labor_observations enable row level security;
drop policy if exists "own labor observations read" on public.labor_observations;
create policy "own labor observations read" on public.labor_observations for select to authenticated
  using (public.owns_provider(provider_id) or public.is_verified_admin(auth.uid()));
drop policy if exists "own labor observations insert" on public.labor_observations;
create policy "own labor observations insert" on public.labor_observations for insert to authenticated
  with check (public.owns_provider(provider_id));

-- ----------------------------- submit quote with lines (+ labor fields)
create or replace function public.submit_provider_quote_lines(
  _request_id uuid, _items jsonb, _tax integer, _notes text, _timeframe text, _warranty text, _fitment_confirmed boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  it jsonb; qid uuid; pid uuid; n integer := 0;
  parts integer := 0; labor integer := 0; fees integer := 0; hours numeric := 0;
  qty numeric; price integer; line integer; has_parts boolean := false; op text;
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

  qid := public.submit_provider_quote(_request_id, parts, labor, fees, coalesce(_tax, 0), _notes, _timeframe, _warranty);
  select provider_id into pid from public.provider_quotes where id = qid;

  update public.provider_quotes
     set labor_hours = nullif(hours, 0),
         fitment_confirmed_at = case when has_parts then now() else null end
   where id = qid;

  for it in select * from jsonb_array_elements(_items) loop
    qty := coalesce((it->>'quantity')::numeric, 1);
    price := coalesce((it->>'unit_price_cents')::integer, 0);
    op := nullif(it->>'operation_key', '');
    if op is not null and not exists (select 1 from public.repair_operations where key = op) then op := null; end if;
    insert into public.provider_quote_items (
      quote_id, provider_id, kind, sort_order, name, quantity, unit_price_cents, line_total_cents,
      brand, part_number, provider_unit_cost_cents, supplier, labor_hours, labor_rate_cents, fitment_status,
      operation_key, labor_time_source, suggested_labor_hours)
    values (
      qid, pid, it->>'kind', n, left(coalesce(nullif(trim(it->>'name'), ''), initcap(it->>'kind')), 200), qty, price, round(qty * price),
      nullif(left(trim(coalesce(it->>'brand', '')), 120), ''),
      nullif(left(trim(coalesce(it->>'part_number', '')), 120), ''),
      nullif(it->>'provider_unit_cost_cents', '')::integer,
      nullif(left(trim(coalesce(it->>'supplier', '')), 120), ''),
      nullif(it->>'labor_hours', '')::numeric,
      nullif(it->>'labor_rate_cents', '')::integer,
      case when it->>'kind' = 'part' then 'provider_confirmed' else 'unverified' end,
      case when it->>'kind' = 'labor' then op end,
      case when it->>'kind' = 'labor' and it->>'labor_time_source' in ('reference','licensed','repara_observed','provider_default','manual') then it->>'labor_time_source' end,
      case when it->>'kind' = 'labor' then nullif(it->>'suggested_labor_hours', '')::numeric end);
    n := n + 1;
  end loop;
  return qid;
end $$;
revoke all on function public.submit_provider_quote_lines(uuid, jsonb, integer, text, text, text, boolean) from public, anon;
grant execute on function public.submit_provider_quote_lines(uuid, jsonb, integer, text, text, text, boolean) to authenticated;
