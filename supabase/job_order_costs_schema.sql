-- Platinum Hub — Orders → Job costs pipeline
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: table/column/policy creation is guarded, same convention
-- as jobs_schema.sql / users_schema.sql.
--
-- Every order line item linked to a job becomes a "pending" candidate cost
-- here first; an admin edits category/description/amount and approves it,
-- which is the point it actually lands in job_actual_costs and starts
-- counting toward budget-vs-actual. Requires job_categories_schema.sql to
-- already be applied (category_id references job_categories).

create table if not exists public.job_order_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  category_id uuid references public.job_categories(id),
  description text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists job_order_costs_order_item_id_idx on public.job_order_costs(order_item_id);
create index if not exists job_order_costs_job_id_idx on public.job_order_costs(job_id);

-- Links an approved job_order_costs row to the job_actual_costs row it
-- created, so re-approving (or ever un-approving) doesn't create duplicates.
alter table public.job_actual_costs add column if not exists job_order_cost_id uuid references public.job_order_costs(id) on delete set null;
create unique index if not exists job_actual_costs_job_order_cost_id_idx on public.job_actual_costs(job_order_cost_id) where job_order_cost_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Select/insert/update at admin+supervisor — same level as the orders
-- table itself (orders_schema.sql), since saving an order is what creates
-- these rows. Delete and the job_actual_costs insert an approval performs
-- stay admin-only (job_actual_costs' own RLS, unchanged, already enforces
-- that on the approval side).

alter table public.job_order_costs enable row level security;

drop policy if exists "job_order_costs_select" on public.job_order_costs;
create policy "job_order_costs_select" on public.job_order_costs
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'supervisor')
    )
  );

drop policy if exists "job_order_costs_insert" on public.job_order_costs;
create policy "job_order_costs_insert" on public.job_order_costs
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'supervisor')
    )
  );

drop policy if exists "job_order_costs_update" on public.job_order_costs;
create policy "job_order_costs_update" on public.job_order_costs
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'supervisor')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'supervisor')
    )
  );

drop policy if exists "job_order_costs_delete" on public.job_order_costs;
create policy "job_order_costs_delete" on public.job_order_costs
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
