-- Platinum Painters Hub — Marketing ROI (ad spend per lead source per
-- month), daily "something's not right" alerts and the monthly business
-- report. Run once in the Supabase SQL Editor. Safe to re-run.

-- What was spent on each lead source each month (Reports → Marketing ROI).
create table if not exists public.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  month date not null,          -- the 1st of the month
  source text not null,         -- a lead source label (src/lib/jobs/leadSources.ts)
  amount numeric(12,2) not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  unique (month, source)
);
alter table public.marketing_spend enable row level security;
drop policy if exists marketing_spend_admin_all on public.marketing_spend;
create policy marketing_spend_admin_all on public.marketing_spend
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Every alert / report already emailed, so nothing is sent twice.
-- Service role only.
create table if not exists public.hub_alert_log (
  key text primary key,
  detail text,
  sent_at timestamptz not null default now()
);
alter table public.hub_alert_log enable row level security;

-- The daily run: alerts every working morning, the monthly report on the 1st.
insert into public.app_cron_tokens (name, token)
values ('hub_cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'hub-daily';

-- 7:00am NZ = 18:00 UTC (summer) / 19:00 UTC (winter); the Hub only acts on
-- the run that lands on 7am NZ.
select cron.schedule(
  'hub-daily',
  '0 18,19 * * *',
  $$ select net.http_post(
       url := 'https://platinum-painters-hub.vercel.app/api/cron/daily',
       headers := jsonb_build_object('content-type', 'application/json',
         'x-cron-token', (select token from public.app_cron_tokens where name = 'hub_cron')),
       body := '{}'::jsonb) $$
);
