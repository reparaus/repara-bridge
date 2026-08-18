-- 0009_quote_comms_parts.sql
-- Additive only. Safe to re-run. No data is modified or removed.
--
-- Adds:
--   1. Per-request preferred contact channel + confirmation delivery tracking.
--   2. Parts-supplier readiness on quote line items (brand, part number,
--      supplier metadata, internal cost) and service grouping.
--   3. Message categories + metadata on the communication log so quotes,
--      confirmations, clarifications and free-form messages share ONE thread.
--
-- Business logic stays in the database: the frontend can be replaced without
-- losing quote structure, part sourcing data or the customer conversation.

-- ------------------------------------------------- service request contact
alter table public.service_requests
  add column if not exists preferred_contact_method public.contact_method not null default 'text',
  add column if not exists confirmation_channel text,
  add column if not exists confirmation_sent_at timestamptz;

comment on column public.service_requests.preferred_contact_method is
  'Channel the customer chose FOR THIS REQUEST (snapshot; customers.preferred_contact_method holds the latest).';
comment on column public.service_requests.confirmation_channel is
  'Channel the automatic customer confirmation actually went out on (email | sms | none).';

-- --------------------------------------------------- quote line item parts
alter table public.quote_items
  add column if not exists group_label text,
  add column if not exists part_brand text,
  add column if not exists part_number text,
  add column if not exists supplier text,
  add column if not exists supplier_location text,
  add column if not exists supplier_product_id text,
  add column if not exists availability text,
  add column if not exists internal_unit_cost numeric,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.quote_items.group_label is
  'Service card this line belongs to, so labor + parts + fees stay grouped per service.';
comment on column public.quote_items.internal_unit_cost is
  'Repara internal cost per unit. ADMIN ONLY — never exposed on the customer quote page.';
comment on column public.quote_items.supplier_product_id is
  'External supplier/catalog identifier, reserved for the future parts-supplier integration.';

create index if not exists idx_quote_items_part_number
  on public.quote_items (part_number)
  where part_number is not null;

-- ------------------------------------------------------------------ quotes
alter table public.quotes
  add column if not exists sent_channel text,
  add column if not exists send_error text,
  add column if not exists internal_cost_total numeric not null default 0;

comment on column public.quotes.internal_cost_total is
  'Sum of internal part costs. ADMIN ONLY — used for margin, never sent to customers.';

-- ------------------------------------------------------- communication log
alter table public.request_communications
  add column if not exists category text not null default 'message',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.request_communications.category is
  'confirmation | clarification | quote | message | reply — one thread per request.';

-- SMS is architecturally supported already (channel = ''sms''). Until a provider
-- is connected, outbound SMS rows are stored with status ''not_configured'' so
-- the intent is auditable and nothing is silently dropped.
do $$ begin
  alter table public.request_communications
    drop constraint if exists request_communications_status_check;
exception when others then null; end $$;
