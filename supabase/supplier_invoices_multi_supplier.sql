-- Platinum Painters Hub — invoices from any supplier, not just Resene
-- Run once in the Hub's Supabase SQL Editor, after resene_invoice_lines_split.sql.
-- Safe to re-run.
--
-- suppliers: a short curated list, "type a new one" style, same pattern as
-- job_categories - typing an unrecognised name into the upload dropdown
-- creates a row here (findOrCreateSupplierId) and it stays for next time.
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists suppliers_name_idx on public.suppliers (lower(name));

insert into public.suppliers (name)
select v.name from (values ('Resene'), ('Aalto'), ('Superloo')) as v(name)
where not exists (select 1 from public.suppliers s where lower(s.name) = lower(v.name));

-- The invoice tables were Resene-only in name but already generic in shape
-- (item code/description/qty/price) - this is a rename plus a supplier_id
-- column, not a new table. Postgres binds foreign keys, indexes and RLS
-- policies to a table's OID, not its name, so every one of those keeps
-- working across the rename with nothing else to update.
alter table if exists public.resene_invoices rename to supplier_invoices;
alter table if exists public.resene_invoice_lines rename to supplier_invoice_lines;

alter table public.supplier_invoices add column if not exists supplier_id uuid references public.suppliers(id);
update public.supplier_invoices
set supplier_id = (select id from public.suppliers where lower(name) = 'resene')
where supplier_id is null;
alter table public.supplier_invoices alter column supplier_id set not null;

-- resene_invoices_unique_number.sql made invoice_number unique on its own,
-- back when every invoice was Resene's - now that two different suppliers
-- could each hand out their own "1001", uniqueness needs to be scoped per
-- supplier instead.
drop index if exists public.resene_invoices_invoice_number_idx;
create unique index if not exists supplier_invoices_supplier_invoice_number_idx
  on public.supplier_invoices(supplier_id, invoice_number);

-- A supplier with no PDF parser yet (anything but Resene, until a sample
-- invoice lets one be built) is entered by hand instead - no PDF, and a
-- line has no Resene-style item code. Both pdf_path and item_code were
-- already nullable, so this only needs a flag for the UI (e.g. no "view
-- PDF" link on a manual one) - not a constraint change.
alter table public.supplier_invoices add column if not exists source text not null default 'parsed';
alter table public.supplier_invoices drop constraint if exists supplier_invoices_source_check;
alter table public.supplier_invoices add constraint supplier_invoices_source_check
  check (source in ('parsed', 'manual'));

-- ── RLS: admin-only, same convention as the rest of the Jobs module ─────
alter table public.suppliers enable row level security;

drop policy if exists "suppliers_admin_select" on public.suppliers;
create policy "suppliers_admin_select" on public.suppliers
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "suppliers_admin_insert" on public.suppliers;
create policy "suppliers_admin_insert" on public.suppliers
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
