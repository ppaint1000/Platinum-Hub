-- Platinum Painters Hub — a "Supplier invoices" tick on the Users page
-- (upload supplier invoices and match them to jobs). Supervisors start
-- with it ticked. The invoice tables stay admin-only; the Hub's server
-- does the work for a ticked person after checking this.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.user_app_access add column if not exists invoices boolean not null default false;

update public.user_app_access a set invoices = true
from public.profiles p
where p.id = a.user_id and p.role::text = 'supervisor' and not a.invoices;

-- Check: should show invoices_column = 1.
select count(*) as invoices_column from information_schema.columns
where table_schema = 'public' and table_name = 'user_app_access' and column_name = 'invoices';
