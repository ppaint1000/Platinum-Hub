-- Platinum Hub — Job budget categories become data, not a fixed enum
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Not safely re-runnable past the first run — it migrates job_budget_lines
-- and job_actual_costs off the budget_category enum onto job_categories(id)
-- and then drops the enum column, so re-running after that would fail at
-- the "add column category_id" step finding it already gone. The table
-- creation/seed/policy statements are individually guarded if you do need
-- to re-run just those.
--
-- Why: admins need to add their own budget categories (e.g. a new access
-- type), which a fixed Postgres enum can't do without a migration each
-- time. job_categories is now the source of truth for the 8 categories
-- from src/design/categories.ts (which is removed once the app reads from
-- the DB instead).

create table if not exists public.job_categories (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.job_categories (key, label, sort_order)
values
  ('labour', 'Labour', 0),
  ('paint', 'Paint', 1),
  ('sundries', 'Sundries', 2),
  ('access_scaffold', 'Scaffold', 3),
  ('access_ewp', 'EWP', 4),
  ('access_other', 'Other access', 5),
  ('subbies', 'Subcontractors', 6),
  ('other', 'Other', 7)
on conflict (key) do nothing;

-- ── job_budget_lines: enum column → category_id ────────────────────────

alter table public.job_budget_lines add column if not exists category_id uuid references public.job_categories(id);

update public.job_budget_lines jbl
set category_id = jc.id
from public.job_categories jc
where jbl.category::text = jc.key and jbl.category_id is null;

alter table public.job_budget_lines alter column category_id set not null;

-- ── job_actual_costs: enum column → category_id ─────────────────────────

alter table public.job_actual_costs add column if not exists category_id uuid references public.job_categories(id);

update public.job_actual_costs jac
set category_id = jc.id
from public.job_categories jc
where jac.category::text = jc.key and jac.category_id is null;

alter table public.job_actual_costs alter column category_id set not null;

-- ── Reporting view: rebuilt on category_id, one row per (job, category)
--    via cross join so callers no longer need to fill in zero-rows for
--    categories with nothing budgeted/spent yet. Must be replaced BEFORE
--    the old `category` columns are dropped below, since the old view
--    definition still references them. ──────────────────────────────────

-- drop + create (not `create or replace`) — the column set/order is
-- genuinely changing (category → category_id/category_key/category_label),
-- which `create or replace view` refuses ("cannot change name of view
-- column").
drop view if exists public.job_budget_vs_actual;

create view public.job_budget_vs_actual
with (security_invoker = true) as
with budget as (
  select job_id, category_id, sum(budgeted_amount) as budgeted_amount
  from public.job_budget_lines
  group by job_id, category_id
),
actual as (
  select job_id, category_id, sum(amount) as actual_amount
  from public.job_actual_costs
  group by job_id, category_id
)
select
  j.id as job_id,
  j.job_number,
  j.name as job_name,
  j.status,
  jc.id as category_id,
  jc.key as category_key,
  jc.label as category_label,
  jc.sort_order,
  coalesce(b.budgeted_amount, 0) as budgeted_amount,
  coalesce(a.actual_amount, 0) as actual_amount,
  coalesce(a.actual_amount, 0) - coalesce(b.budgeted_amount, 0) as variance_amount
from public.jobs j
cross join public.job_categories jc
left join budget b on b.job_id = j.id and b.category_id = jc.id
left join actual a on a.job_id = j.id and a.category_id = jc.id;

-- Now safe to drop — the view above no longer references these. The
-- budget_category enum type itself is left in place (not dropped): the
-- dormant resene_item_category_map table (schema only, ingestion is a
-- later phase — see jobs_schema.sql) still uses it and wasn't part of
-- this migration.
alter table public.job_budget_lines drop column if exists category;
alter table public.job_actual_costs drop column if exists category;

-- ── RLS: admin-only, same convention as the rest of the Jobs module ─────

alter table public.job_categories enable row level security;

drop policy if exists "job_categories_admin_select" on public.job_categories;
create policy "job_categories_admin_select" on public.job_categories
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "job_categories_admin_insert" on public.job_categories;
create policy "job_categories_admin_insert" on public.job_categories
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "job_categories_admin_update" on public.job_categories;
create policy "job_categories_admin_update" on public.job_categories
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "job_categories_admin_delete" on public.job_categories;
create policy "job_categories_admin_delete" on public.job_categories
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
