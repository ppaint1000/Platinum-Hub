-- Platinum Hub — Resene invoices are the source of actual costs
-- Run this once in the Supabase SQL Editor, after job_order_costs_removal.sql
-- and job_categories_schema.sql.
--
-- resene_invoices/resene_invoice_lines/resene_item_category_map already
-- existed (jobs_schema.sql) as unused placeholders. This wires them up:
-- an uploaded Resene invoice is matched to a job by PO number, and its
-- lines are the thing an admin approves into job_actual_costs — never an
-- order's own guessed price. Not safely re-runnable past the enum-drop
-- step, same caveat as job_categories_schema.sql.

-- ── resene_item_category_map: last enum→category_id holdout ─────────────

alter table public.resene_item_category_map add column if not exists category_id uuid references public.job_categories(id);

update public.resene_item_category_map ricm
set category_id = jc.id
from public.job_categories jc
where ricm.category::text = jc.key and ricm.category_id is null;

alter table public.resene_item_category_map alter column category_id set not null;
alter table public.resene_item_category_map drop column if exists category;

-- ── resene_invoices: job link + stored PDF path ──────────────────────────

alter table public.resene_invoices add column if not exists job_id uuid references public.jobs(id);
alter table public.resene_invoices add column if not exists pdf_path text;

-- ── resene_invoice_lines: enum→category_id, plus approval state ─────────

alter table public.resene_invoice_lines add column if not exists category_id uuid references public.job_categories(id);

update public.resene_invoice_lines ril
set category_id = jc.id
from public.job_categories jc
where ril.category::text = jc.key and ril.category_id is null;

alter table public.resene_invoice_lines drop column if exists category;

alter table public.resene_invoice_lines add column if not exists status text not null default 'pending' check (status in ('pending', 'approved'));
alter table public.resene_invoice_lines add column if not exists approved_at timestamptz;
alter table public.resene_invoice_lines add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- Now safe to drop — every table that used to reference the enum
-- (job_budget_lines, job_actual_costs, resene_item_category_map,
-- resene_invoice_lines) has been migrated to category_id.
drop type if exists public.budget_category;

-- ── job_actual_costs: link to the approved invoice line ──────────────────

alter table public.job_actual_costs add column if not exists resene_invoice_line_id uuid references public.resene_invoice_lines(id);
create unique index if not exists job_actual_costs_resene_invoice_line_id_idx on public.job_actual_costs(resene_invoice_line_id) where resene_invoice_line_id is not null;

-- ── Storage: private bucket for the uploaded invoice PDFs ────────────────
-- Admin-only, same as the rest of the Jobs domain — no per-user folder
-- scoping needed (unlike fleet-photos), any admin can see every invoice.

insert into storage.buckets (id, name, public)
values ('resene-invoices', 'resene-invoices', false)
on conflict (id) do nothing;

drop policy if exists "resene_invoices_insert_admin" on storage.objects;
create policy "resene_invoices_insert_admin" on storage.objects
  for insert with check (
    bucket_id = 'resene-invoices'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "resene_invoices_select_admin" on storage.objects;
create policy "resene_invoices_select_admin" on storage.objects
  for select using (
    bucket_id = 'resene-invoices'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
