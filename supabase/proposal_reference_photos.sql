-- Platinum Painters Hub — proposal reference photos: a library of photos
-- (Settings > Proposal templates) and, on each proposal, the ones ticked to
-- show in its "Reference photos" section.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.proposal_settings add column if not exists reference_photos jsonb not null default '[]'::jsonb;
alter table public.proposals add column if not exists reference_photos jsonb not null default '[]'::jsonb;

-- Check: should show columns = 2.
select count(*) as columns from information_schema.columns
where table_schema = 'public' and column_name = 'reference_photos' and table_name in ('proposal_settings', 'proposals');
