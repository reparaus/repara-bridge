-- 0013_findings_inspection.sql
-- Findings become a lightweight digital inspection sheet.
--
-- Purely ADDITIVE and safe to re-run. Existing findings keep working: they get
-- condition 'needs_attention' only when their severity implies attention, and
-- no severity, detail, evidence or recommendation link is rewritten.

alter table public.job_findings
  -- Vehicle system grouping for the inspection sheet (BRAKES / ELECTRICAL / …).
  add column if not exists system text,
  -- Inspection condition. Deliberately separate from `severity`: red condition
  -- does NOT by itself mean unsafe or an emergency.
  add column if not exists condition text not null default 'needs_attention',
  -- Safety is only ever set from technician input or documented evidence.
  add column if not exists safety_concern boolean not null default false,
  add column if not exists photo_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_findings_condition_check'
  ) then
    alter table public.job_findings
      add constraint job_findings_condition_check
      check (condition in ('good','monitor','needs_attention','not_inspected'));
  end if;
end $$;

comment on column public.job_findings.condition is
  'Inspection condition: good | monitor | needs_attention | not_inspected. Independent of severity — needs_attention is not a safety claim.';
comment on column public.job_findings.safety_concern is
  'True only when the technician marked it, or documented evidence supports it. Never inferred by AI alone.';

create index if not exists job_findings_system_idx
  on public.job_findings (service_request_id, system);

-- Backfill condition from existing severity, without touching severity itself.
update public.job_findings
   set condition = case
         when severity = 'monitor' then 'monitor'
         when severity = 'informational' then 'good'
         else 'needs_attention'
       end
 where condition = 'needs_attention'
   and severity in ('monitor', 'informational');
