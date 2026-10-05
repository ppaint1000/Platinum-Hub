-- Platinum Painters Hub — Health & safety Templates: a template's form file
-- (e.g. downloaded from HazardCo) is a safety document of type 'template',
-- tied to the template by key (see src/lib/safety/templates.ts).
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.safety_documents add column if not exists template_key text;

alter table public.safety_documents drop constraint if exists safety_documents_category_check;
alter table public.safety_documents add constraint safety_documents_category_check
  check (category in ('general', 'hazard', 'accident', 'worker', 'contractor', 'other', 'template'));

-- Check: should show template_key_column = 1.
select count(*) as template_key_column from information_schema.columns
where table_schema = 'public' and table_name = 'safety_documents' and column_name = 'template_key';
