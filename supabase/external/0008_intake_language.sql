-- 0008_intake_language.sql
-- Customer language preference + AI-assisted intake follow-up answers.
-- Purely additive and safe to re-run. No existing column, row, policy or
-- migration is replaced, and no customer-submitted data is modified.

alter table public.service_requests
  add column if not exists preferred_language text not null default 'en',
  add column if not exists intake_followups   jsonb  not null default '[]'::jsonb;

-- Keep the value constrained without breaking older rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_requests_preferred_language_check'
  ) then
    alter table public.service_requests
      add constraint service_requests_preferred_language_check
      check (preferred_language in ('en', 'es'));
  end if;
end $$;

comment on column public.service_requests.preferred_language is
  'Language the customer used in the quote form (en | es). Follow up in this language.';
comment on column public.service_requests.intake_followups is
  'Customer answers to AI-suggested intake follow-up questions: [{questionId, question, answer, category, skipped}]. Advisory only — never a diagnosis or a price.';

-- Existing grants and RLS on public.service_requests already cover these
-- columns; no policy changes are required.
