-- Platinum Painters Hub — clock on (8am) / clock off (4:30pm) reminder
-- emails on working days. Supabase's scheduler (pg_cron) calls the Hub's
-- /api/cron/clock-reminders, which decides who gets one (see
-- src/lib/timesheets/email/clockReminders.ts). Safe to re-run.
--
-- pg_cron runs in UTC and NZ moves between UTC+13 (summer) and UTC+12
-- (winter), so each job fires at both UTC times; the Hub only sends the run
-- that lands on 8:00 / 4:30 NZ time.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The token the scheduler sends and the Hub checks. No policies: service
-- role only.
create table if not exists public.app_cron_tokens (
  name text primary key,
  token text not null
);
alter table public.app_cron_tokens enable row level security;
insert into public.app_cron_tokens (name, token)
values ('clock_reminders', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- One reminder of each kind per person per day.
create table if not exists public.clock_reminder_sends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('on', 'off')),
  sent_at timestamptz not null default now(),
  primary key (user_id, day, kind)
);
alter table public.clock_reminder_sends enable row level security;

select cron.unschedule(jobid) from cron.job where jobname in ('clock-on-reminder', 'clock-off-reminder');

-- 8:00am NZ = 19:00 UTC (summer) / 20:00 UTC (winter), the day before.
select cron.schedule(
  'clock-on-reminder',
  '0 19,20 * * *',
  $$ select net.http_post(
       url := 'https://platinum-painters-hub.vercel.app/api/cron/clock-reminders?kind=on',
       headers := jsonb_build_object('content-type', 'application/json',
         'x-cron-token', (select token from public.app_cron_tokens where name = 'clock_reminders')),
       body := '{}'::jsonb) $$
);

-- 4:30pm NZ = 03:30 UTC (summer) / 04:30 UTC (winter).
select cron.schedule(
  'clock-off-reminder',
  '30 3,4 * * *',
  $$ select net.http_post(
       url := 'https://platinum-painters-hub.vercel.app/api/cron/clock-reminders?kind=off',
       headers := jsonb_build_object('content-type', 'application/json',
         'x-cron-token', (select token from public.app_cron_tokens where name = 'clock_reminders')),
       body := '{}'::jsonb) $$
);
