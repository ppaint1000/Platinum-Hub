-- Platinum Painters Hub — "Log an order" can be someone's landing page
-- (Users -> Default app). Run once in the Supabase SQL Editor. Safe to re-run.
alter table public.user_app_access drop constraint if exists user_app_access_default_app_check;
alter table public.user_app_access add constraint user_app_access_default_app_check
  check (default_app in ('hub', 'dashboard', 'timesheets', 'production', 'sales', 'jobs', 'costing', 'measures', 'orders', 'fleet', 'order_log'));
