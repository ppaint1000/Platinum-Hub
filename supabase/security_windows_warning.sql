-- Hub WARNING: a sign-in on a new Windows computer emails every admin with
-- the subject "Hub WARNING", and again every 15 minutes until an admin
-- opens the link in the email and confirms they've read it.
-- See src/lib/security/windowsWarning.ts. Safe to re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.hub_security_warnings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid unique,
  user_id uuid references public.profiles(id) on delete cascade,
  user_agent text,
  ip text,
  city text,
  country text,
  signed_in_at timestamptz not null default now(),
  -- The secret in the "I've read this" link.
  ack_token text not null unique,
  send_count integer not null default 0,
  last_sent_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at timestamptz not null default now()
);
create index if not exists hub_security_warnings_open_idx on public.hub_security_warnings (last_sent_at) where acknowledged_at is null;

-- Service role only.
alter table public.hub_security_warnings enable row level security;

insert into public.app_cron_tokens (name, token)
values ('security_warnings', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'hub-security-warnings';

-- Every 15 minutes, all day.
select cron.schedule(
  'hub-security-warnings',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://platinum-painters-hub.vercel.app/api/cron/security-warnings',
       headers := jsonb_build_object('content-type', 'application/json',
         'x-cron-token', (select token from public.app_cron_tokens where name = 'security_warnings')),
       body := '{}'::jsonb) $$
);
