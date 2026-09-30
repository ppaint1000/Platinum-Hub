-- Platinum Painters Hub — where each job's enquiry came from.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Set on the add/edit job forms (the list is in src/lib/jobs/leadSources.ts);
-- the Clients dashboard shows the win rate for each source.

alter table public.jobs add column if not exists lead_source text;
