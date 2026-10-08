-- ============================================================================
-- Repara — 0031 PROVIDER DIRECTORY LOCKDOWN
-- ----------------------------------------------------------------------------
-- Re-run safe. Security audit #4.
--
--   * "active providers are public" let anonymous visitors AND any signed-in
--     user read every column of active providers straight from the API,
--     including owner_user_id, the owner's SMS notification number/consent,
--     metadata and private pricing defaults. Provider rows are now read only
--     by their owner, verified admins, and server code (service role), which
--     selects the public fields for profiles and directories.
--   * Anonymous callers lose all access to the provider tables.
--   * Role-probe helpers (has_role / is_staff / is_verified_admin) are no
--     longer callable anonymously, so nobody can test whether an account id
--     is staff. Signed-in policies keep using them.
--
-- Apply AFTER the code that reads providers server-side is deployed.
-- ============================================================================

drop policy if exists "active providers are public" on public.service_providers;

revoke all on public.service_providers, public.provider_services, public.provider_service_areas from anon;

-- provider_services / provider_service_areas keep their policies: they resolve
-- through service_providers, so a signed-in user now sees only their own
-- provider's rows (verified admins see all through the admin policy).

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_staff(uuid) from public, anon;
revoke execute on function public.is_verified_admin(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_staff(uuid) to authenticated, service_role;
grant execute on function public.is_verified_admin(uuid) to authenticated, service_role;
