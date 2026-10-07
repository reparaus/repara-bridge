-- ============================================================================
-- Repara — 0029 GARAGE LINK HARDENING
-- ----------------------------------------------------------------------------
-- Re-run safe. Nothing is dropped except the over-broad policies replaced below.
--
-- Closes the vehicle ownership holes found in the security audit:
--   * "own garage" (FOR ALL) let a signed-in user insert a garage link to ANY
--     vehicle_id, or reactivate an ended link. Links are now created and ended
--     only by server code (service role); drivers may read their links and
--     edit nickname / is_primary on ACTIVE links only.
--   * vehicles were insertable/updatable from the browser session (including
--     vin and customer_id). Every vehicle write already runs server-side with
--     the service role, so authenticated write access is removed.
--   * profiles.email (and every other column) was self-editable, which made
--     contact-based request claiming spoofable. Only the columns the app edits
--     stay updatable; email is not one of them.
--
-- owns_vehicle() is unchanged: it stays correct once links can't be forged.
-- Staff access is unchanged ("staff manage vehicles" etc. are untouched).
-- ============================================================================

-- ----------------------------------------------------------- garage_vehicles
drop policy if exists "own garage" on public.garage_vehicles;

drop policy if exists "own garage read" on public.garage_vehicles;
create policy "own garage read" on public.garage_vehicles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own garage edit" on public.garage_vehicles;
create policy "own garage edit" on public.garage_vehicles
  for update to authenticated
  using (user_id = auth.uid() and ownership_ended_at is null)
  with check (user_id = auth.uid() and ownership_ended_at is null);

revoke insert, update, delete, truncate on public.garage_vehicles from authenticated;
revoke all on public.garage_vehicles from anon;
grant select on public.garage_vehicles to authenticated;
grant update (nickname, is_primary, updated_at) on public.garage_vehicles to authenticated;

-- ------------------------------------------------------------------ vehicles
drop policy if exists "authenticated creates vehicle" on public.vehicles;
drop policy if exists "owner updates vehicle" on public.vehicles;

revoke insert, update, delete, truncate on public.vehicles from authenticated;
revoke all on public.vehicles from anon;
grant select on public.vehicles to authenticated;

-- ------------------------------------------------------------------ profiles
revoke update, truncate on public.profiles from authenticated;
revoke all on public.profiles from anon;
grant update (
  first_name,
  last_name,
  phone,
  preferred_language,
  notification_preferences,
  notify_channel,
  phone_e164,
  sms_consent_at,
  updated_at
) on public.profiles to authenticated;
