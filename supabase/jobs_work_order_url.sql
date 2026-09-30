-- Platinum Painters Hub — the crew's work order on each job.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- The Costing app (Measures) sends a job's work order link (/w/<token>)
-- with every save (see /api/integrations/quotes/jobs). Painters open it from
-- the clock-in page for the job's site.

alter table public.jobs add column if not exists work_order_url text;
