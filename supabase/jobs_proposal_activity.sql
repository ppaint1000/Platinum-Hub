-- Platinum Painters Hub — online proposal activity on jobs.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- The Costing app (Measures) sends the customer a proposal link; it tells
-- the Hub when the link is sent, opened and accepted (see
-- /api/integrations/quotes/proposal-activity). Shown on the Sales
-- dashboards' "Awaiting reply" lists.

alter table public.jobs add column if not exists proposal_url text;
alter table public.jobs add column if not exists proposal_sent_at timestamptz;
alter table public.jobs add column if not exists proposal_viewed_at timestamptz;
alter table public.jobs add column if not exists proposal_view_count integer not null default 0;
alter table public.jobs add column if not exists proposal_accepted_at timestamptz;
