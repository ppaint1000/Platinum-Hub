-- Platinum Painters Hub — send timesheet hours to Xero Payroll NZ as draft
-- timesheets (Timesheets → Xero payroll). Run once in the Supabase SQL
-- Editor. Safe to re-run.
--
-- All three tables are service-role only (no policies): the Xero page checks
-- the person is an admin, then reads and writes them on the server. The
-- connection row holds Xero's tokens, so it must never be readable from the
-- browser.

-- The one Xero organisation the Hub is connected to.
create table if not exists public.xero_connection (
  id integer primary key default 1 check (id = 1),
  tenant_id text not null,
  tenant_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  -- The pay item hours go on (e.g. "Ordinary Hours").
  earnings_rate_id text,
  earnings_rate_name text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.xero_connection enable row level security;

-- Which Xero employee each Hub person is.
create table if not exists public.xero_employee_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xero_employee_id text not null,
  xero_name text,
  updated_at timestamptz not null default now()
);
alter table public.xero_employee_links enable row level security;

-- Every timesheet sent, so a pay period isn't sent twice (re-sending
-- replaces the draft in Xero).
create table if not exists public.xero_timesheet_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  xero_timesheet_id text,
  hours numeric(8,2) not null default 0,
  pushed_by uuid references public.profiles(id) on delete set null,
  pushed_at timestamptz not null default now(),
  unique (user_id, period_start)
);
alter table public.xero_timesheet_pushes enable row level security;

-- A person's own pay item, when it isn't the usual one (e.g. a set hourly
-- rate earnings line). Null = the pay item chosen for everyone.
alter table public.xero_employee_links add column if not exists earnings_rate_id text;
alter table public.xero_employee_links add column if not exists earnings_rate_name text;
