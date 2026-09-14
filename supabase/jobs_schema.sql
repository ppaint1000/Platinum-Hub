-- Platinum Painters Hub — Jobs module schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: table/type creation is guarded, and policies are
-- dropped/recreated. Matches the flat-file convention of schema.sql and
-- orders_schema.sql — there is no supabase/migrations directory here.
--
-- Deliberate departures from the original design sketch, confirmed with
-- the client on 2026-09-12:
--   * No company_id anywhere — this Hub is single-tenant. Access control
--     is role-based via public.profiles, same as every other table here.
--   * Admin-only, not admin/supervisor like Orders/Fleet — the client
--     wants Jobs restricted to admins at this stage.
--   * job_number format is PP-YY-NNN (e.g. PP-26-001), assigned when a
--     job's status flips to 'won', continuing the spirit of the existing
--     YYNNNN scheme in the historical "Quotes and Orders" spreadsheet but
--     with a literal "PP-" prefix and a fresh per-year counter.
--   * No separate job_orders join table — a job_id column is added
--     directly onto the existing public.orders table instead, since an
--     order already belongs to exactly one job. public.orders.project_number
--     is the value sent to Resene as "Customer PO Number" and is what
--     resene_invoices.customer_po_number will be matched against.
--   * Budget categories (8, not the original 4) come straight from
--     src/design/categories.ts: labour, paint, sundries, access_scaffold,
--     access_ewp, access_other, subbies, other.

-- ── Enums ───────────────────────────────────────────────────────────────

do $$ begin
  create type public.job_status as enum (
    'draft', 'quoted', 'won', 'in_progress', 'complete', 'lost'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.budget_category as enum (
    'labour', 'paint', 'sundries',
    'access_scaffold', 'access_ewp', 'access_other',
    'subbies', 'other'
  );
exception when duplicate_object then null;
end $$;

-- ── Tables: CRM ─────────────────────────────────────────────────────────

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- ── Tables: Jobs ────────────────────────────────────────────────────────

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text unique,
  name text not null,
  client_id uuid references public.clients(id) on delete set null,
  status public.job_status not null default 'draft',
  quoted_sell_total numeric(12,2),
  quoted_hours numeric(10,2),
  quoted_at date,
  won_at timestamptz,
  lead_by text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_client_id_idx on public.jobs(client_id);

-- Per-year counter backing the PP-YY-NNN job number. A dedicated table
-- (rather than a Postgres sequence) because the sequence needs to reset
-- per calendar year, keyed by the 2-digit year code.
create table if not exists public.job_number_counters (
  year_code text primary key,
  last_seq integer not null default 0
);

-- Assigns job_number the first time a job's status becomes 'won'. The
-- insert ... on conflict ... returning is a single atomic statement, so
-- two jobs won at the same moment still get distinct sequence numbers.
create or replace function public.assign_job_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yr text := to_char(now(), 'YY');
  seq integer;
begin
  if new.status = 'won' and (old.status is distinct from 'won') and new.job_number is null then
    insert into public.job_number_counters (year_code, last_seq)
    values (yr, 1)
    on conflict (year_code) do update set last_seq = public.job_number_counters.last_seq + 1
    returning last_seq into seq;

    new.job_number := 'PP-' || yr || '-' || lpad(seq::text, 3, '0');

    if new.won_at is null then
      new.won_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists jobs_assign_job_number on public.jobs;
create trigger jobs_assign_job_number
  before update on public.jobs
  for each row
  execute function public.assign_job_number();

create table if not exists public.job_budget_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  category public.budget_category not null,
  description text,
  budgeted_amount numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_budget_lines_job_id_idx on public.job_budget_lines(job_id);

create table if not exists public.job_actual_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  category public.budget_category not null,
  description text,
  amount numeric(12,2) not null default 0,
  source text, -- e.g. 'resene_invoice', 'timesheet', 'manual'
  incurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- Added after initial rollout: lets labour-category rows carry hours
-- worked, not just $, so job pages can show hours quoted vs actual.
alter table public.job_actual_costs add column if not exists hours numeric(10,2);

create index if not exists job_actual_costs_job_id_idx on public.job_actual_costs(job_id);

-- Links a supplier order to the job it belongs to. project_number on this
-- existing table is what gets sent to Resene as "Customer PO Number".
alter table public.orders add column if not exists job_id uuid references public.jobs(id) on delete set null;
create index if not exists orders_job_id_idx on public.orders(job_id);

-- ── Tables: Resene invoice ingestion (schema only — ingestion is a later phase) ─

create table if not exists public.resene_item_category_map (
  item_code text primary key,
  category public.budget_category not null,
  description text
);

-- Fixed mappings called out by the client — always sundries regardless of
-- what gets learned for other item codes.
insert into public.resene_item_category_map (item_code, category, description)
values
  ('PWL-T', 'sundries', 'Paintwise Levy'),
  ('TMPCHG', 'sundries', 'Temporary Surcharge')
on conflict (item_code) do nothing;

create table if not exists public.resene_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_po_number text,
  invoice_number text,
  invoice_date date,
  subtotal numeric(12,2),
  total numeric(12,2),
  raw_email_id text,
  created_at timestamptz not null default now()
);

create index if not exists resene_invoices_customer_po_number_idx on public.resene_invoices(customer_po_number);

create table if not exists public.resene_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.resene_invoices(id) on delete cascade,
  line_no integer,
  item_code text,
  description text,
  discount numeric(12,2),
  quantity numeric(12,2),
  unit_price numeric(12,2),
  subtotal numeric(12,2),
  category public.budget_category,
  created_at timestamptz not null default now()
);

create index if not exists resene_invoice_lines_invoice_id_idx on public.resene_invoice_lines(invoice_id);

-- ── Reporting views ─────────────────────────────────────────────────────
-- security_invoker so these run with the querying user's own RLS, not the
-- view owner's (Supabase's SQL editor runs as postgres, which bypasses RLS
-- by default — without this, the admin-only policies above would be
-- silently skipped for anyone querying the views directly).

create or replace view public.job_budget_vs_actual
with (security_invoker = true) as
with categories as (
  select unnest(enum_range(null::public.budget_category)) as category
),
budget as (
  select job_id, category, sum(budgeted_amount) as budgeted_amount
  from public.job_budget_lines
  group by job_id, category
),
actual as (
  select job_id, category, sum(amount) as actual_amount
  from public.job_actual_costs
  group by job_id, category
)
select
  j.id as job_id,
  j.job_number,
  j.name as job_name,
  j.status,
  c.category,
  coalesce(b.budgeted_amount, 0) as budgeted_amount,
  coalesce(a.actual_amount, 0) as actual_amount,
  coalesce(a.actual_amount, 0) - coalesce(b.budgeted_amount, 0) as variance_amount
from public.jobs j
cross join categories c
left join budget b on b.job_id = j.id and b.category = c.category
left join actual a on a.job_id = j.id and a.category = c.category;

-- Per-job rollup used by the Jobs list (profit/margin) and job detail page
-- (hours quoted vs actual) — one row per job instead of one per category.
create or replace view public.job_totals
with (security_invoker = true) as
select
  j.id as job_id,
  coalesce(b.budgeted_total, 0) as budgeted_total,
  coalesce(a.actual_total, 0) as actual_total,
  coalesce(a.actual_total, 0) - coalesce(b.budgeted_total, 0) as variance_total,
  coalesce(a.hours_actual, 0) as hours_actual
from public.jobs j
left join (
  select job_id, sum(budgeted_amount) as budgeted_total
  from public.job_budget_lines
  group by job_id
) b on b.job_id = j.id
left join (
  select job_id, sum(amount) as actual_total, sum(coalesce(hours, 0)) as hours_actual
  from public.job_actual_costs
  group by job_id
) a on a.job_id = j.id;

-- ── RLS: admin-only ─────────────────────────────────────────────────────
-- Every table below is admin-only, unlike Orders/Fleet (admin + supervisor).

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.jobs enable row level security;
alter table public.job_budget_lines enable row level security;
alter table public.job_actual_costs enable row level security;
alter table public.job_number_counters enable row level security;
alter table public.resene_item_category_map enable row level security;
alter table public.resene_invoices enable row level security;
alter table public.resene_invoice_lines enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'client_contacts', 'jobs', 'job_budget_lines',
    'job_actual_costs', 'job_number_counters', 'resene_item_category_map',
    'resene_invoices', 'resene_invoice_lines'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'jobs_admin_select_' || t, t);
    execute format(
      'create policy %I on public.%I for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))',
      'jobs_admin_select_' || t, t
    );

    execute format('drop policy if exists %I on public.%I', 'jobs_admin_insert_' || t, t);
    execute format(
      'create policy %I on public.%I for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))',
      'jobs_admin_insert_' || t, t
    );

    execute format('drop policy if exists %I on public.%I', 'jobs_admin_update_' || t, t);
    execute format(
      'create policy %I on public.%I for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin'')) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))',
      'jobs_admin_update_' || t, t
    );

    execute format('drop policy if exists %I on public.%I', 'jobs_admin_delete_' || t, t);
    execute format(
      'create policy %I on public.%I for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))',
      'jobs_admin_delete_' || t, t
    );
  end loop;
end $$;
