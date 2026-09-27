-- 0024 — Real SMS delivery (Twilio) on top of the 0023 notification system.
-- Re-run safe. Requires 0014, 0016, 0023.
-- No new messaging system: in-app rows stay as-is; notification_deliveries now
-- logs SMS attempts next to email, with its own dedupe keys.

-- 1. "Both" as a request contact choice (text = SMS, email, call, both).
alter type public.contact_method add value if not exists 'both';

-- 2. Guest / request contact: normalized phone + explicit SMS consent.
alter table public.customers
  add column if not exists phone_e164 text,
  add column if not exists sms_consent_at timestamptz;
alter table public.service_requests
  add column if not exists phone_e164 text,
  add column if not exists sms_consent_at timestamptz;
comment on column public.service_requests.sms_consent_at is
  'When the customer agreed to transactional texts for THIS request. No consent = no SMS.';

-- 3. Signed-in drivers: external channel, SMS number and consent.
alter table public.profiles
  add column if not exists notify_channel text not null default 'email',
  add column if not exists phone_e164 text,
  add column if not exists sms_consent_at timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_notify_channel_check
    check (notify_channel in ('email','sms','both','in_app'));
exception when duplicate_object then null; end $$;

-- 4. Providers: their own channel, SMS number and consent (owner-updatable
--    through the existing owner policy on service_providers).
alter table public.service_providers
  add column if not exists notify_channel text not null default 'email',
  add column if not exists notify_phone_e164 text,
  add column if not exists sms_consent_at timestamptz;
do $$ begin
  alter table public.service_providers add constraint service_providers_notify_channel_check
    check (notify_channel in ('email','sms','both','in_app'));
exception when duplicate_object then null; end $$;

-- 5. Delivery log: SMS-specific outcomes.
alter table public.notification_deliveries drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status in ('sent','failed','skipped_pref','skipped_no_address','skipped_no_consent',
                    'skipped_invalid_phone','not_configured'));
alter table public.notification_deliveries
  add column if not exists provider_message_id text;

-- Future event types (not sent yet — no scheduling exists):
-- appointment_requested, appointment_confirmed, appointment_rescheduled,
-- appointment_cancelled, appointment_reminder. The delivery function already
-- has short SMS/email copy for them so enabling scheduling needs no new plumbing.
