-- Platinum Painters Hub — Orders schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: table creation is guarded, and policies are dropped/recreated.

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  project text not null,
  project_number text,
  order_date date not null default current_date,
  updated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Adds the column for setups where orders already existed before it was
-- introduced. Left null on creation — only set (in the app) when an order
-- is edited, so its presence marks "this order has been changed since
-- it was created".
alter table public.orders add column if not exists updated_at timestamptz;

-- Auto-generated 4-digit project number (0001, 0002, …), starting fresh
-- regardless of any manually-typed values already in older orders.
-- Applies only when the app omits project_number on insert — leave this
-- as the sole source until the projects-quoted app exists to supply real
-- project numbers instead.
create sequence if not exists public.orders_project_number_seq start 1;
alter table public.orders alter column project_number
  set default lpad(nextval('public.orders_project_number_seq')::text, 4, '0');

-- Lets the New Order page show what number WOULD be assigned, without
-- actually consuming it from the sequence — so an order you start but
-- never save doesn't burn a number that the next real order should get.
create or replace function public.next_project_number_preview()
returns text
language sql
security definer
set search_path = public
as $$
  select lpad((last_value + case when is_called then 1 else 0 end)::text, 4, '0')
  from public.orders_project_number_seq;
$$;

grant execute on function public.next_project_number_preview() to authenticated;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  is_paint boolean not null default false,
  description text not null,
  colour text,
  size text,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0,
  line_total numeric(10,2) generated always as (round(quantity * unit_price, 2)) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Adds columns for setups where order_items already existed before they
-- were introduced.
alter table public.order_items add column if not exists colour text;
alter table public.order_items add column if not exists size text;
alter table public.order_items add column if not exists is_paint boolean not null default false;

-- Existing rows that already had a colour were clearly paint lines —
-- flag them so they don't lose their Colour box on next edit.
update public.order_items set is_paint = true where colour is not null and is_paint = false;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- ── orders / order_items: admin only ─────────────────────────────────────

drop policy if exists "orders_admin_all" on public.orders;
create policy "orders_admin_all" on public.orders
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "order_items_admin_all" on public.order_items;
create policy "order_items_admin_all" on public.order_items
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
