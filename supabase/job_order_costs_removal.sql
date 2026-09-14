-- Platinum Hub — remove the Phase-3 job_order_costs mechanism
-- Run this once in the Supabase SQL Editor.
--
-- Superseded: job_order_costs let an admin approve a cost using an order's
-- own guessed line-item price. Corrected — an order is a request, not
-- proof of spend (Resene routinely bills surcharges/discounts that never
-- appear on the order). See resene_invoices_schema.sql for the
-- replacement: actual costs now come from a matched invoice or manual
-- entry only.

alter table public.job_actual_costs drop column if exists job_order_cost_id;
drop table if exists public.job_order_costs;
