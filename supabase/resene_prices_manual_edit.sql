-- Platinum Painters Hub — manual edits on the Resene price list
-- Run this once in the Supabase SQL Editor, after resene_prices_schema.sql.
-- Safe to re-run.
--
-- Lets an edit made in Measures (Costing > Resene Paint Prices) stick even
-- if a later invoice re-states the same $ for that item — see
-- src/lib/resene/priceList.ts's recordPrices(), which now only overwrites a
-- row when the invoice's price actually differs from what's stored, so an
-- unchanged reinvoice no longer wipes out a hand-corrected base/size.

alter table public.resene_prices add column if not exists source text not null default 'invoice';
alter table public.resene_prices add column if not exists edited_at timestamptz;

alter table public.resene_prices drop constraint if exists resene_prices_source_check;
alter table public.resene_prices add constraint resene_prices_source_check
  check (source in ('invoice', 'manual'));
