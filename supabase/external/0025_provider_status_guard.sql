-- ============================================================================
-- Repara — 0025 PROVIDER STATUS GUARD
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Closes one gap found in the provider QA pass:
-- the "provider owner updates own" policy (0016) let a provider owner change
-- ANY column of their own row with a direct database call — including
-- status = 'active' (skipping admin review), is_demo and certifications.
--
-- The app never does this, but the database must enforce it. Verified admins
-- and the service role are unaffected.
-- ============================================================================

create or replace function public.guard_provider_owner_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted callers: service role (server jobs) and verified admins (review).
  if coalesce(auth.role(), '') = 'service_role' or public.is_verified_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.is_demo := false;
    new.certifications := '{}';
    return new;
  end if;

  -- Owners may not reassign, flag as demo, or self-certify.
  new.owner_user_id := old.owner_user_id;
  new.is_demo := old.is_demo;
  new.certifications := old.certifications;

  if new.status is distinct from old.status then
    -- Allowed owner transitions only: submit for review, or pause.
    if new.status = 'pending_review' and old.status in ('draft', 'paused', 'pending_review') then
      null;
    elsif new.status = 'paused' and old.status in ('active', 'pending_review') then
      null;
    else
      raise exception 'Only Repara can change this provider status';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_provider_owner_changes on public.service_providers;
create trigger trg_guard_provider_owner_changes
  before insert or update on public.service_providers
  for each row execute function public.guard_provider_owner_changes();
