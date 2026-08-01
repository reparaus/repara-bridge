-- 0004_submission_idempotency.sql
-- Per-submission idempotency key for service requests.
-- Safe to re-run. No existing data is modified or removed.
--
-- Duplicate prevention is scoped to a SINGLE form submission attempt
-- (double-click, browser/network retry, success-page refresh). It is NOT based
-- on customer identity: the same customer (same phone, email, name or VIN) can
-- submit unlimited legitimate service requests over time, because each new
-- quote generates a new submission_id.

alter table public.service_requests
  add column if not exists submission_id uuid;

comment on column public.service_requests.submission_id is
  'Client-generated idempotency key for one submission attempt. Unique when present; unrelated to customer identity.';

-- Partial unique index: only rows that actually carry a key are constrained,
-- so historical rows (submission_id is null) are untouched.
create unique index if not exists service_requests_submission_id_key
  on public.service_requests (submission_id)
  where submission_id is not null;
