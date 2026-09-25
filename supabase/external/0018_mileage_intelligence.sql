-- ============================================================================
-- Repara — 0018 MILEAGE INTELLIGENCE + EXPANDED SERVICE TAXONOMY
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Extends the EXISTING mileage history from 0014
-- (public.vehicle_mileage_history) instead of creating a second mileage table.
--
--   * mileage_source enum        + provider_service, estimated
--   * vehicle_mileage_history    + confidence, metadata (provenance per reading)
--   * vehicles                   + current_mileage_source / _confidence
--   * apply_mileage_reading()    source-quality aware; estimates never
--                                override a real reading; no silent regressions
--   * guard_mileage_reading()    signed-in owners can only record owner-reported
--                                readings — "verified" is reserved for the server
--   * service_categories         new keys for the expanded taxonomy
-- Nothing is dropped, renamed or deleted. Historical readings are never edited.
-- ============================================================================

-- ------------------------------------------------------------------- enums
alter type public.mileage_source add value if not exists 'provider_service';
alter type public.mileage_source add value if not exists 'estimated';

-- ---------------------------------------------------- reading provenance
alter table public.vehicle_mileage_history
  add column if not exists confidence text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.vehicle_mileage_history
    add constraint vehicle_mileage_history_confidence_check
    check (confidence is null or confidence in ('verified','high','medium','owner_reported','estimated'));
exception when duplicate_object then null; end $$;

update public.vehicle_mileage_history
   set confidence = case source::text
     when 'repara_shop' then 'verified'
     when 'connected_vehicle' then 'high'
     when 'imported_provider' then 'high'
     else 'owner_reported'
   end
 where confidence is null;

alter table public.vehicles
  add column if not exists current_mileage_source text,
  add column if not exists current_mileage_confidence text;

-- Source quality, highest first. Smartcar or any other connector is only ever
-- a 'connected_vehicle' source — no single provider is hard-coded on top.
create or replace function public.mileage_source_rank(_source text)
returns integer language sql immutable as $$
  select case _source
    when 'connected_vehicle' then 60
    when 'repara_shop' then 50
    when 'provider_service' then 40
    when 'imported_provider' then 30
    when 'service_record' then 20
    when 'owner' then 20
    when 'intake' then 20
    when 'estimated' then 0
    else 10
  end
$$;

-- ------------------------------------------------ insert guard (BEFORE)
-- Fills confidence from the source and stops a signed-in driver from labelling
-- their own entry as verified / connected / shop mileage.
create or replace function public.guard_mileage_reading()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_staff(auth.uid()) then
    if new.source::text not in ('owner','service_record','intake') then
      new.source := 'owner';
    end if;
    new.confidence := 'owner_reported';
  end if;

  if new.confidence is null then
    new.confidence := case new.source::text
      when 'repara_shop' then 'verified'
      when 'provider_service' then 'verified'
      when 'connected_vehicle' then 'high'
      when 'imported_provider' then 'high'
      when 'estimated' then 'estimated'
      else 'owner_reported'
    end;
  end if;
  -- An estimate can never be stored as anything but an estimate.
  if new.source::text = 'estimated' then new.confidence := 'estimated'; end if;
  return new;
end $$;

drop trigger if exists guard_vehicle_mileage on public.vehicle_mileage_history;
create trigger guard_vehicle_mileage
  before insert on public.vehicle_mileage_history
  for each row execute function public.guard_mileage_reading();

-- ------------------------------------------- current mileage (AFTER)
-- The vehicle mirror follows the best CREDIBLE reading:
--   * a real reading replaces an estimate (then estimates recalibrate from it)
--   * a higher real reading replaces a lower one
--   * an equal reading from a better source upgrades the provenance
--   * an estimate only moves the mirror when the mirror is itself an estimate
--     and never goes below the last real reading
--   * a lower real reading is kept in history but never lowers the mirror
create or replace function public.apply_mileage_reading()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
  last_real integer;
begin
  select current_mileage, current_mileage_source, current_mileage_confidence, mileage_updated_at
    into v from public.vehicles where id = new.vehicle_id;
  if not found then return new; end if;

  if new.confidence = 'estimated' then
    select max(mileage) into last_real from public.vehicle_mileage_history
     where vehicle_id = new.vehicle_id and coalesce(confidence, '') <> 'estimated';
    if (v.current_mileage is null or coalesce(v.current_mileage_confidence, '') = 'estimated')
       and new.mileage >= coalesce(last_real, 0) then
      update public.vehicles
         set current_mileage = new.mileage, mileage_updated_at = new.recorded_at,
             current_mileage_source = new.source::text, current_mileage_confidence = 'estimated'
       where id = new.vehicle_id;
    end if;
    return new;
  end if;

  if v.current_mileage is null
     or coalesce(v.current_mileage_confidence, '') = 'estimated'
     or new.mileage > v.current_mileage
     or (new.mileage = v.current_mileage
         and public.mileage_source_rank(new.source::text) > public.mileage_source_rank(coalesce(v.current_mileage_source, 'owner'))) then
    -- Replacing an estimate must still respect the last real reading.
    select max(mileage) into last_real from public.vehicle_mileage_history
     where vehicle_id = new.vehicle_id and id <> new.id and coalesce(confidence, '') <> 'estimated';
    if new.mileage >= coalesce(last_real, 0) then
      update public.vehicles
         set current_mileage = new.mileage, mileage_updated_at = new.recorded_at,
             current_mileage_source = new.source::text, current_mileage_confidence = new.confidence
       where id = new.vehicle_id;
    end if;
  end if;
  return new;
end $$;

-- Trigger from 0014 already points at apply_mileage_reading(); recreate safely.
drop trigger if exists apply_vehicle_mileage on public.vehicle_mileage_history;
create trigger apply_vehicle_mileage
  after insert on public.vehicle_mileage_history
  for each row execute function public.apply_mileage_reading();

-- Backfill the provenance of each vehicle's current mileage from its history.
with best as (
  select distinct on (m.vehicle_id) m.vehicle_id, m.source::text as source, m.confidence
    from public.vehicle_mileage_history m
    join public.vehicles v on v.id = m.vehicle_id and v.current_mileage = m.mileage
   order by m.vehicle_id, public.mileage_source_rank(m.source::text) desc, m.recorded_at desc
)
update public.vehicles v
   set current_mileage_source = best.source,
       current_mileage_confidence = best.confidence
  from best
 where best.vehicle_id = v.id and v.current_mileage_source is null;

-- ------------------------------------------------ expanded service taxonomy
insert into public.service_categories (key, group_key, label_en, label_es, position) values
  ('general_mechanic','repair','General repair','Reparación general',10),
  ('check_engine','repair','Check engine light','Luz de check engine',32),
  ('warning_lights','repair','Warning lights','Luces de advertencia',34),
  ('preventive_maintenance','repair','Preventive maintenance','Mantenimiento preventivo',72),
  ('oil_service','repair','Oil service','Cambio de aceite',74),
  ('steering','repair','Steering','Dirección',82),
  ('cooling','repair','Cooling system','Sistema de enfriamiento',84),
  ('overheating','repair','Overheating','Sobrecalentamiento',86),
  ('ac','repair','A/C & heating','Aire acondicionado y calefacción',60),
  ('drivetrain','repair','Drivetrain','Tren motriz',102),
  ('battery','repair','Battery','Batería',52),
  ('starting_charging','repair','Starting & charging','Arranque y carga',54),
  ('noise_vibration','repair','Noise / vibration','Ruido / vibración',104),
  ('leaks','repair','Leaks','Fugas',106),
  ('drivability','repair','Performance issue','Problema de rendimiento',108),
  ('tire_repair','tires','Tire repair','Reparación de llantas',205),
  ('mounting_balancing','tires','Wheel install & balancing','Montaje y balanceo',210),
  ('tpms','tires','TPMS','Sensor de presión (TPMS)',235),
  ('windshield_replacement','glass','Windshield & auto glass','Parabrisas y cristales',170),
  ('glass_repair','glass','Glass chip / crack repair','Reparación de cristales',180),
  ('windshield_tint','glass','Windshield tint','Polarizado de parabrisas',195),
  ('detailing','detail','Detail','Detallado',110),
  ('mobile_detailing','detail','Mobile detail','Detallado a domicilio',120),
  ('ppf','detail','PPF / paint protection','PPF / protección de pintura',150),
  ('wraps','detail','Wrap','Vinil / wrap',160),
  ('body_repair','body','Collision & body repair','Hojalatería y colisión',240),
  ('bumper','body','Bumper','Defensa',245),
  ('intake','performance','Intake','Admisión',275),
  ('suspension_upgrade','performance','Suspension upgrades','Mejoras de suspensión',277),
  ('performance','performance','Performance modifications','Modificaciones de rendimiento',280),
  ('lighting','performance','Lighting','Iluminación',285),
  ('aftermarket_install','performance','Aftermarket installation','Instalación de accesorios',315)
on conflict (key) do update
  set group_key = excluded.group_key,
      label_en = excluded.label_en,
      label_es = excluded.label_es,
      position = excluded.position;
