-- Platinum Painters Hub — a "Log an order" tick on Users → Page access
-- (the paper order book numbers against jobs, so supplier bills in Xero land
-- on the right job). Supervisors and sales users start ticked.
-- Run once in the Supabase SQL Editor. Safe to re-run.
alter table public.user_app_access add column if not exists order_log boolean not null default false;

update public.user_app_access a
   set order_log = true
  from public.profiles p
 where p.id = a.user_id and p.role in ('admin', 'supervisor', 'sales') and a.order_log = false;
