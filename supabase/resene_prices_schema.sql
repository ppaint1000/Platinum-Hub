-- Platinum Painters Hub — Resene price list
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- One row per Resene item code, holding the price you were most recently
-- invoiced for it. Filled automatically every time a Resene invoice PDF is
-- uploaded (src/app/api/jobs/invoices/upload/route.ts); the first time the
-- list is read it's also built from any invoices already uploaded. The
-- Measures app's Costing > Resene Paint Prices tab reads it through
-- /api/integrations/resene-prices.

create table if not exists public.resene_prices (
  item_code text primary key,
  description text not null,
  -- Paint base (e.g. Deep, Mid, Pastel, Accent) when the invoice text
  -- names one. Null for anything that doesn't.
  base text,
  -- Litres, read from the description ("10L", "4L", "800ml"). Null for
  -- brushes, tools and other things that aren't sold by volume.
  size_litres numeric(10,3),
  -- What was actually paid per unit: the invoice line total / quantity, so
  -- the trade discount is already taken off.
  unit_price numeric(12,2) not null,
  price_per_litre numeric(12,4)
    generated always as (case when size_litres > 0 then unit_price / size_litres end) stored,
  discount numeric(6,2),
  invoice_number text,
  price_date date,
  updated_at timestamptz not null default now()
);

alter table public.resene_prices enable row level security;

drop policy if exists "jobs_admin_select_resene_prices" on public.resene_prices;
create policy "jobs_admin_select_resene_prices" on public.resene_prices
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "jobs_admin_insert_resene_prices" on public.resene_prices;
create policy "jobs_admin_insert_resene_prices" on public.resene_prices
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "jobs_admin_update_resene_prices" on public.resene_prices;
create policy "jobs_admin_update_resene_prices" on public.resene_prices
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
