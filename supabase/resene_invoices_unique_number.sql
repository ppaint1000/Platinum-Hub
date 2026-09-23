-- Platinum Painters Hub — stop the same Resene invoice being uploaded twice
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- The upload route (src/app/api/jobs/invoices/upload/route.ts) now checks
-- for an existing invoice_number before saving and rejects a repeat with a
-- clear message; this unique index is the backstop against a race (two
-- uploads landing at the same instant) or a future direct insert bypassing
-- the app.

create unique index if not exists resene_invoices_invoice_number_idx
  on public.resene_invoices(invoice_number);
