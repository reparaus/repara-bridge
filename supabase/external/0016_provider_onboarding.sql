-- ============================================================================
-- Repara — 0016 PROVIDER ONBOARDING + PROVIDER PROFILE FOUNDATION
-- ----------------------------------------------------------------------------
-- Additive and re-run safe. Builds on 0015 (service_providers,
-- provider_services, provider_service_areas, service_categories). Nothing is
-- renamed or dropped; no provider rows are created (no fake businesses).
--
-- What this adds:
--   * provider_status  gains 'pending_review'
--   * provider_kind    gains 'accessories'
--   * service_providers.logo_url  (optional provider-supplied logo)
--   * updated_at maintenance on service_providers
--   * RLS so a provider user manages ONLY their own profile/services/areas
--   * RLS so a verified admin can review, activate or pause providers
-- ============================================================================

-- ------------------------------------------------------------------- enums
alter type public.provider_status add value if not exists 'pending_review';
alter type public.provider_kind add value if not exists 'accessories';

-- --------------------------------------------------------------- columns
alter table public.service_providers add column if not exists logo_url text;

-- Keep updated_at honest (function created in 0001).
drop trigger if exists trg_service_providers_updated_at on public.service_providers;
create trigger trg_service_providers_updated_at
  before update on public.service_providers
  for each row execute function public.set_updated_at();

create index if not exists idx_providers_owner on public.service_providers(owner_user_id);

-- ------------------------------------------------------------------ grants
grant insert, update on public.service_providers to authenticated;
grant insert, delete on public.provider_services to authenticated;
grant insert, update, delete on public.provider_service_areas to authenticated;

-- ============================================================ provider RLS
-- A provider user owns exactly their own rows. Possession of a provider id
-- never grants write access: every policy is scoped to owner_user_id.
do $$ begin
  create policy "provider owner creates own" on public.service_providers
    for insert to authenticated with check (owner_user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "provider owner updates own" on public.service_providers
    for update to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Owner reads its own services/areas even while the profile is draft/paused,
-- which the public 'active only' policies from 0015 deliberately hide.
do $$ begin
  create policy "provider owner reads own services" on public.provider_services
    for select to authenticated using (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.owner_user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "provider owner writes own services" on public.provider_services
    for all to authenticated
    using (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.owner_user_id = auth.uid())
    )
    with check (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.owner_user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "provider owner reads own areas" on public.provider_service_areas
    for select to authenticated using (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.owner_user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "provider owner writes own areas" on public.provider_service_areas
    for all to authenticated
    using (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.owner_user_id = auth.uid())
    )
    with check (
      exists (select 1 from public.service_providers p
              where p.id = provider_id and p.owner_user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- =============================================================== admin RLS
-- Same boundary as the rest of the admin surface: approved admin + MFA
-- (public.is_verified_admin from 0006). No verification badges are implied.
do $$ begin
  create policy "verified admin reads providers" on public.service_providers
    for select to authenticated using (public.is_verified_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "verified admin updates providers" on public.service_providers
    for update to authenticated
    using (public.is_verified_admin(auth.uid()))
    with check (public.is_verified_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "verified admin reads provider services" on public.provider_services
    for select to authenticated using (public.is_verified_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "verified admin reads provider areas" on public.provider_service_areas
    for select to authenticated using (public.is_verified_admin(auth.uid()));
exception when duplicate_object then null; end $$;
