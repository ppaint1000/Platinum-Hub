-- Platinum Painters Hub — the Users page "Default app" is where each person
-- lands after signing in, and it can now be any app (Dashboard, Production
-- board, Sales, Costing, Site Measures...). Run once in the Supabase SQL
-- Editor. Safe to re-run.

alter table public.user_app_access drop constraint if exists user_app_access_default_app_check;
alter table public.user_app_access add constraint user_app_access_default_app_check
  check (default_app in ('hub', 'dashboard', 'timesheets', 'production', 'sales', 'jobs', 'costing', 'measures', 'orders', 'fleet'));

-- Keep everyone landing where they do today, now that it follows the
-- setting exactly: admins on the Dashboard, sales staff on Sales.
update public.user_app_access a set default_app = 'dashboard'
from public.profiles p
where p.id = a.user_id and p.role = 'admin' and a.default_app <> 'dashboard';

update public.user_app_access a set default_app = 'sales'
from public.profiles p
where p.id = a.user_id and p.role = 'sales' and a.sales and a.default_app <> 'sales';

select p.role, a.default_app, count(*)
from public.profiles p join public.user_app_access a on a.user_id = p.id
group by 1, 2 order by 1;
