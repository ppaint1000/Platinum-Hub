-- Platinum Painters Hub — editable proposal pricing: prices typed over the
-- costing's, lines removed, and extra lines added, per proposal
-- ({ prices: {key: number}, removed: [key], extra: [{key, label, price}] }).
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.proposals add column if not exists pricing_edits jsonb not null default '{}'::jsonb;

-- Check: should show pricing_edits_column = 1.
select count(*) as pricing_edits_column from information_schema.columns
where table_schema = 'public' and table_name = 'proposals' and column_name = 'pricing_edits';
