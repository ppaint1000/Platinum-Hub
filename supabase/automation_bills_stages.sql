-- Platinum Painters Hub — less typing: Xero bills onto job costs, order
-- numbers per job, jobs that move themselves along, a clock-in site when a
-- job is won, and weekly budget snapshots. Run once in the Supabase SQL
-- Editor. Safe to re-run.

-- ── Xero bills -> job costs ─────────────────────────────────────────────

-- A cost line that came from a Xero bill (one line per bill).
alter table public.job_actual_costs add column if not exists xero_bill_id text;
create unique index if not exists job_actual_costs_xero_bill_idx on public.job_actual_costs (xero_bill_id);
alter table public.xero_connection add column if not exists bills_synced_at timestamptz;

-- Order numbers suppliers put on their bills, per job. A job's own number
-- (e.g. 26-056) always counts too - these are the extra ones.
create table if not exists public.job_order_numbers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  order_number text not null,
  created_at timestamptz not null default now(),
  unique (order_number)
);
alter table public.job_order_numbers enable row level security;
drop policy if exists job_order_numbers_admin_all on public.job_order_numbers;
create policy job_order_numbers_admin_all on public.job_order_numbers
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Each supplier's cost category, or left out altogether (e.g. a
-- subcontractor whose hours already cost to jobs from timesheets).
-- Service role only.
create table if not exists public.xero_supplier_settings (
  contact_name text primary key,
  category_id uuid references public.job_categories(id) on delete set null,
  excluded boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.xero_supplier_settings enable row level security;
insert into public.xero_supplier_settings (contact_name, excluded)
values ('Amir Collins Painting Services', true)
on conflict (contact_name) do update set excluded = true;

-- Bills that didn't name a job or order number - picked by hand, or marked
-- overheads. Service role only.
create table if not exists public.xero_unmatched_bills (
  xero_bill_id text primary key,
  bill_number text,
  reference text,
  contact_name text,
  bill_date date,
  subtotal numeric(12,2),
  status text,
  job_id uuid references public.jobs(id) on delete set null,
  overhead boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.xero_unmatched_bills enable row level security;

-- ── Jobs that move themselves along ─────────────────────────────────────

-- First clock-in on a job's site: Won / Scheduled -> In progress.
create or replace function public.job_in_progress_on_clock_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs j
     set status = 'in_progress'
   where j.id = (select s.job_id from public.sites s where s.id = new.site_id)
     and j.status::text in ('won', 'scheduled');
  return new;
end;
$$;
drop trigger if exists timesheet_entries_job_in_progress on public.timesheet_entries;
create trigger timesheet_entries_job_in_progress
  after insert on public.timesheet_entries
  for each row execute function public.job_in_progress_on_clock_in();

-- A job reaching Won (or further) without a clock-in site gets one, named
-- after the job, so painters can clock in straight away.
create or replace function public.job_site_on_win()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status::text in ('won', 'scheduled', 'in_progress')
     and (tg_op = 'INSERT' or old.status::text not in ('won', 'scheduled', 'in_progress', 'complete', 'invoiced', 'paid'))
     and not exists (select 1 from public.sites s where s.job_id = new.id) then
    insert into public.sites (name, client_id, job_id, is_active)
    values (new.name, new.client_id, new.id, true);
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_site_on_win on public.jobs;
create trigger jobs_site_on_win
  after insert or update of status on public.jobs
  for each row execute function public.job_site_on_win();

-- ── Variations -> Xero draft invoices ───────────────────────────────────

alter table public.job_variations add column if not exists xero_invoice_id text;

-- ── Weekly budget trend ─────────────────────────────────────────────────

-- Each live job's budget and actual cost every Monday, to show the trend.
-- Service role only.
create table if not exists public.job_budget_snapshots (
  job_id uuid not null references public.jobs(id) on delete cascade,
  week date not null,
  budget numeric(12,2) not null,
  actual numeric(12,2) not null,
  primary key (job_id, week)
);
alter table public.job_budget_snapshots enable row level security;
