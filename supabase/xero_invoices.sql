-- Platinum Painters Hub — customer invoices from Xero become claims on the
-- job (the job number in the invoice's Reference, e.g. 26-056). Run once in
-- the Supabase SQL Editor. Safe to re-run.

-- Claims that came from Xero carry the invoice's id (one claim per invoice).
alter table public.job_claims add column if not exists xero_invoice_id text;
alter table public.job_claims add column if not exists xero_status text;
-- (Many manual claims have none - nulls don't clash in a unique index.)
create unique index if not exists job_claims_xero_invoice_idx on public.job_claims (xero_invoice_id);

-- Invoices from this date on are brought in; and when the Hub last checked.
alter table public.xero_connection add column if not exists invoices_since date;
alter table public.xero_connection add column if not exists invoices_synced_at timestamptz;
update public.xero_connection set invoices_since = '2026-10-13' where invoices_since is null;

-- Xero invoices whose Reference didn't name a job - picked by hand on the
-- Unmatched Xero invoices page (job_id set), or dismissed. Service role only.
create table if not exists public.xero_unmatched_invoices (
  xero_invoice_id text primary key,
  invoice_number text,
  reference text,
  contact_name text,
  invoice_date date,
  subtotal numeric(12,2),
  status text,
  job_id uuid references public.jobs(id) on delete set null,
  dismissed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.xero_unmatched_invoices enable row level security;
