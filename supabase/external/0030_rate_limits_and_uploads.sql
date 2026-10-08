-- ============================================================================
-- Repara — 0030 RATE LIMITS + UPLOAD LOCKDOWN
-- ----------------------------------------------------------------------------
-- Re-run safe. Security audit #6: public AI and photo endpoints had no limits.
--
--   * rate_limits + consume_rate_limit(): fixed-window counters used by
--     src/lib/rate-limit.server.ts (hashed visitor IP or user id, never a raw
--     IP). Service role only.
--   * request-photos / vehicle-documents: size and file-type limits enforced
--     by Storage itself.
--   * The anonymous "upload anything to request-photos" policy is removed;
--     photos are uploaded through one-time signed links issued by the
--     rate-limited createQuotePhotoUploads server function.
--
-- Apply AFTER the code that uses signed upload links is deployed.
-- ============================================================================

-- ------------------------------------------------------------- rate limits
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Counts one action for _key in the current window and returns whether it is
-- still within _max. Old windows are pruned opportunistically.
create or replace function public.consume_rate_limit(_key text, _max integer, _window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  n integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (_key, ws, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into n;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return n <= _max;
end $$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------- storage
update storage.buckets
   set file_size_limit = 10485760,  -- 10 MB (the form allows 8 MB)
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']
 where id = 'request-photos';

update storage.buckets
   set file_size_limit = 15728640,  -- 15 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'vehicle-documents';

drop policy if exists "anon can upload request photos" on storage.objects;
