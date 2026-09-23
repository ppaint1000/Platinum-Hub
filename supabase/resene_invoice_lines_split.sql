-- Platinum Painters Hub — split a Resene invoice across multiple jobs
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Which job a *line* belongs to is now tracked on the line itself
-- (resene_invoice_lines.job_id), not just on the invoice. For an ordinary
-- (non-split) invoice these all match resene_invoices.job_id — set together
-- by assignInvoiceJobAction/moveInvoiceToJobAction so nothing else has to
-- change. Ticking "split across jobs" (splitInvoiceLinesAction) sets each
-- line's job_id independently and clears the invoice's own job_id, since it
-- no longer has a single one.

alter table public.resene_invoice_lines
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

create index if not exists resene_invoice_lines_job_id_idx
  on public.resene_invoice_lines(job_id) where job_id is not null;

alter table public.resene_invoices
  add column if not exists split boolean not null default false;

-- Backfill: every already-linked invoice's lines take on its job_id, so
-- existing (pre-split-feature) invoices keep behaving exactly as before.
update public.resene_invoice_lines l
set job_id = i.job_id
from public.resene_invoices i
where l.invoice_id = i.id
  and i.job_id is not null
  and l.job_id is null;
