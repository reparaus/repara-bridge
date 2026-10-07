-- ============================================================================
-- Repara — 0029 verification (run AFTER applying 0029, in the SQL editor)
-- ----------------------------------------------------------------------------
-- Leaves NO data behind: every write happens inside a sub-transaction that is
-- rolled back on purpose at the end. Output is one row per check: PASS/FAIL.
-- Simulates two signed-in drivers (A owns a vehicle, B is the attacker).
-- ============================================================================

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  v_a uuid;          -- A's vehicle
  v_b uuid;          -- B's active vehicle
  v_b_old uuid;      -- B's previously owned vehicle (ended link)
  link_b uuid;
  link_b_old uuid;
  n int;
  ok boolean;
  results text[] := '{}';
begin
  begin
    -- ---------------------------------------------------------------- setup
    insert into auth.users (id, email)
    values (a, 'rls-test-a-' || a || '@example.invalid'),
           (b, 'rls-test-b-' || b || '@example.invalid');

    insert into public.vehicles (vin, year, make, model)
      values ('RLSTESTA' || upper(left(replace(a::text, '-', ''), 9)), 2020, 'Test', 'Victim')
      returning id into v_a;
    insert into public.vehicles (vin, year, make, model)
      values ('RLSTESTB' || upper(left(replace(b::text, '-', ''), 9)), 2021, 'Test', 'Mine')
      returning id into v_b;
    insert into public.vehicles (vin, year, make, model)
      values ('RLSTESTC' || upper(left(replace(b::text, '-', ''), 9)), 2015, 'Test', 'Sold')
      returning id into v_b_old;

    insert into public.garage_vehicles (user_id, vehicle_id) values (a, v_a);
    insert into public.garage_vehicles (user_id, vehicle_id) values (b, v_b) returning id into link_b;
    insert into public.garage_vehicles (user_id, vehicle_id, ownership_ended_at)
      values (b, v_b_old, now()) returning id into link_b_old;

    -- --------------------------------------------------- act as driver B
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', b::text, true);
    execute 'set local role authenticated';

    -- T1: link someone else's vehicle by id
    begin
      insert into public.garage_vehicles (user_id, vehicle_id) values (b, v_a);
      results := results || 'FAIL T1 B inserted a garage link to A''s vehicle';
    exception when insufficient_privilege then
      results := results || 'PASS T1 B cannot insert a garage link to A''s vehicle';
    end;

    -- T2: read someone else's vehicle
    select count(*) into n from public.vehicles where id = v_a;
    results := results || (case when n = 0 then 'PASS' else 'FAIL' end || ' T2 B cannot read A''s vehicle');

    -- T3: repoint own link at someone else's vehicle
    begin
      update public.garage_vehicles set vehicle_id = v_a where id = link_b;
      results := results || 'FAIL T3 B repointed a link to A''s vehicle';
    exception when insufficient_privilege then
      results := results || 'PASS T3 B cannot change vehicle_id on a link';
    end;

    -- T4: reactivate an ended link (previous owner regaining access)
    begin
      update public.garage_vehicles set ownership_ended_at = null where id = link_b_old;
      results := results || 'FAIL T4 B reactivated an ended link';
    exception when insufficient_privilege then
      results := results || 'PASS T4 B cannot reactivate an ended link';
    end;

    -- T5: edit nickname on own ACTIVE link (must still work)
    update public.garage_vehicles set nickname = 'Daily', is_primary = true where id = link_b;
    get diagnostics n = row_count;
    results := results || (case when n = 1 then 'PASS' else 'FAIL' end || ' T5 B can edit nickname/is_primary on an active link');

    -- T6: edits on an ENDED link are ignored
    update public.garage_vehicles set nickname = 'Old' where id = link_b_old;
    get diagnostics n = row_count;
    results := results || (case when n = 0 then 'PASS' else 'FAIL' end || ' T6 B cannot edit an ended link');

    -- T7: delete a link
    begin
      delete from public.garage_vehicles where id = link_b;
      results := results || 'FAIL T7 B deleted a garage link';
    exception when insufficient_privilege then
      results := results || 'PASS T7 B cannot delete garage links (server ends ownership)';
    end;

    -- T8: create a vehicle from the browser session
    begin
      insert into public.vehicles (vin, year, make, model) values ('RLSTESTD0000000000', 2022, 'Test', 'X');
      results := results || 'FAIL T8 B inserted a vehicle';
    exception when insufficient_privilege then
      results := results || 'PASS T8 B cannot insert vehicles';
    end;

    -- T9: rewrite identity on own vehicle
    begin
      update public.vehicles set vin = 'RLSTESTE0000000000' where id = v_b;
      results := results || 'FAIL T9 B changed a vehicle VIN';
    exception when insufficient_privilege then
      results := results || 'PASS T9 B cannot update vehicles';
    end;

    -- T10: spoof account email
    begin
      update public.profiles set email = 'victim@example.invalid' where id = b;
      results := results || 'FAIL T10 B changed profiles.email';
    exception when insufficient_privilege then
      results := results || 'PASS T10 B cannot change profiles.email';
    end;

    -- T11: normal profile + SMS settings edits still work
    update public.profiles
       set first_name = 'Test', phone = '5555550100', notify_channel = 'email', updated_at = now()
     where id = b;
    get diagnostics n = row_count;
    results := results || (case when n = 1 then 'PASS' else 'FAIL' end || ' T11 B can edit own name/phone/channel');

    -- T12: owns_vehicle reflects only the active link
    ok := public.owns_vehicle(v_b) and not public.owns_vehicle(v_a) and not public.owns_vehicle(v_b_old);
    results := results || (case when ok then 'PASS' else 'FAIL' end || ' T12 owns_vehicle: own active only');

    -- T13: own vehicle and history still readable
    select count(*) into n from public.vehicles where id = v_b;
    results := results || (case when n = 1 then 'PASS' else 'FAIL' end || ' T13 B can read own vehicle');

    execute 'reset role';
    raise exception 'repara_test_rollback';
  exception
    when others then
      if sqlerrm <> 'repara_test_rollback' then
        results := results || ('ERROR ' || sqlstate || ' ' || sqlerrm);
      end if;
  end;

  perform set_config('repara.test_results', array_to_string(results, E'\n'), false);
end $$;

select unnest(string_to_array(current_setting('repara.test_results'), E'\n')) as result;
