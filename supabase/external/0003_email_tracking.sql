-- 0003_email_tracking.sql
-- Adds idempotency + diagnostics columns for the service-request emails.
-- Safe to re-run. No existing data is modified or removed.

alter table public.service_requests
  add column if not exists customer_email_sent_at timestamptz,
  add column if not exists admin_email_sent_at    timestamptz,
  add column if not exists email_status           text,
  add column if not exists email_last_error       text;

comment on column public.service_requests.customer_email_sent_at is
  'Set once the customer confirmation email was accepted by the provider. Gates re-sends.';
comment on column public.service_requests.admin_email_sent_at is
  'Set once the Repara admin notification was accepted by the provider. Gates re-sends.';

-- No new grants: these columns are only read/written by the service role
-- (edge function + server functions). RLS on service_requests is unchanged.
