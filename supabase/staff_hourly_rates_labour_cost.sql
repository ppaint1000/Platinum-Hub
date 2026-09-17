-- Platinum Painters Hub — painter hourly rates -> automatic Labour $ on jobs
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Design: staff_hourly_rates is a standalone table, never selected by any
-- other query in the app and locked to admin-only RLS — unlike a column
-- on profiles (which gets selected broadly for names/dropdowns
-- everywhere), nothing can accidentally leak a rate through an unrelated
-- query. The only thing that ever reads it is job_labour_actual() below,
-- a SECURITY DEFINER function that returns just a job's total $ and
-- hours — never a per-person breakdown or a rate — so it's safe to let
-- any Jobs-app viewer's queries call it (same as they already see every
-- other category's actual $) without granting them any visibility into
-- individual rates.
--
-- A contractor's hourly_rate is used as-is. An employee's is "loaded" up
-- to an effective $/hour actually worked, since they're paid for leave
-- and public holidays they don't work — see job_labour_actual() for the
-- formula. All the entitlement figures are per-employee editable inputs,
-- not global constants, seeded with NZ statutory minimums as defaults.
--
-- job_budget_vs_actual and job_totals are extended to add this live
-- computed figure into the Labour category automatically — no manual
-- "sync" step, no posted/stored row, always reflects current timesheet
-- data and current rates. Never touches timesheets or timesheet reports.

create table if not exists public.staff_hourly_rates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  employment_type text not null default 'employee' check (employment_type in ('contractor', 'employee')),
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  hours_per_week numeric(5,2) not null default 40 check (hours_per_week > 0),
  annual_leave_weeks numeric(5,2) not null default 4 check (annual_leave_weeks >= 0),
  sick_leave_days numeric(5,2) not null default 10 check (sick_leave_days >= 0),
  -- 11 national public holidays + 1 anniversary day, combined into one
  -- editable figure rather than tracked separately.
  public_holidays numeric(5,2) not null default 12 check (public_holidays >= 0),
  updated_at timestamptz not null default now()
);

alter table public.staff_hourly_rates enable row level security;

drop policy if exists "staff_hourly_rates_admin_all" on public.staff_hourly_rates;
create policy "staff_hourly_rates_admin_all" on public.staff_hourly_rates
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Sums a job's timesheet hours (via sites.job_id — the same hop used
-- everywhere else hours are traced back to a job) multiplied by each
-- painter's effective hourly cost. SECURITY DEFINER so it can read
-- staff_hourly_rates regardless of the caller's own RLS access to that
-- table — only the aggregate $ and hours leave this function, nothing
-- about who worked or what they cost.
--
-- Contractor: effective rate = hourly_rate as entered.
-- Employee: hourly_rate is loaded up so it reflects the true cost per
-- hour actually worked, since an employee is paid for annual leave, sick
-- leave, and public holidays (incl. their anniversary day) without
-- working them:
--   paid_hours/yr = hours_per_week * 52
--   non_working paid hours/yr = (annual_leave_weeks * hours_per_week)
--     + (sick_leave_days + public_holidays) * (hours_per_week / 5)
--   effective_rate = hourly_rate * paid_hours/yr / (paid_hours/yr - non_working_paid_hours)
create or replace function public.job_labour_actual(p_job_id uuid)
returns table(amount numeric, hours numeric)
language sql
security definer
set search_path = public
stable
as $$
  with rates as (
    select
      r.user_id,
      case
        when r.employment_type = 'contractor' then r.hourly_rate
        else r.hourly_rate * (r.hours_per_week * 52) / greatest(
          (r.hours_per_week * 52)
            - (r.annual_leave_weeks * r.hours_per_week)
            - (r.sick_leave_days + r.public_holidays) * (r.hours_per_week / 5),
          1
        )
      end as effective_rate
    from public.staff_hourly_rates r
  )
  select
    coalesce(sum(
      (extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
        - coalesce(te.break_minutes, 0) / 60.0)
      * ra.effective_rate
    ), 0)::numeric(12,2) as amount,
    coalesce(sum(
      extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
        - coalesce(te.break_minutes, 0) / 60.0
    ), 0)::numeric(10,2) as hours
  from public.timesheet_entries te
  join public.sites s on s.id = te.site_id
  join rates ra on ra.user_id = te.user_id
  where s.job_id = p_job_id
    and te.clock_out_at is not null;
$$;

-- Same shape as before (job_categories_schema.sql), just adding the
-- live labour figure on top of whatever's already in job_actual_costs
-- for the Labour category (e.g. a manually-entered subcontracted-labour
-- line) — additive, not a replacement.
drop view if exists public.job_budget_vs_actual;

create view public.job_budget_vs_actual
with (security_invoker = true) as
with budget as (
  select job_id, category_id, sum(budgeted_amount) as budgeted_amount
  from public.job_budget_lines
  group by job_id, category_id
),
actual as (
  select job_id, category_id, sum(amount) as actual_amount
  from public.job_actual_costs
  group by job_id, category_id
),
labour as (
  select j.id as job_id, l.amount, l.hours
  from public.jobs j
  cross join lateral public.job_labour_actual(j.id) l
)
select
  j.id as job_id,
  j.job_number,
  j.name as job_name,
  j.status,
  jc.id as category_id,
  jc.key as category_key,
  jc.label as category_label,
  jc.sort_order,
  coalesce(b.budgeted_amount, 0) as budgeted_amount,
  coalesce(a.actual_amount, 0)
    + case when jc.key = 'labour' then coalesce(lb.amount, 0) else 0 end as actual_amount,
  (coalesce(a.actual_amount, 0)
    + case when jc.key = 'labour' then coalesce(lb.amount, 0) else 0 end)
    - coalesce(b.budgeted_amount, 0) as variance_amount
from public.jobs j
cross join public.job_categories jc
left join budget b on b.job_id = j.id and b.category_id = jc.id
left join actual a on a.job_id = j.id and a.category_id = jc.id
left join labour lb on lb.job_id = j.id;

create or replace view public.job_totals
with (security_invoker = true) as
select
  j.id as job_id,
  coalesce(b.budgeted_total, 0) as budgeted_total,
  coalesce(a.actual_total, 0) + coalesce(lb.amount, 0) as actual_total,
  (coalesce(a.actual_total, 0) + coalesce(lb.amount, 0)) - coalesce(b.budgeted_total, 0) as variance_total,
  coalesce(a.hours_actual, 0) + coalesce(lb.hours, 0) as hours_actual
from public.jobs j
left join (
  select job_id, sum(budgeted_amount) as budgeted_total
  from public.job_budget_lines
  group by job_id
) b on b.job_id = j.id
left join (
  select job_id, sum(amount) as actual_total, sum(coalesce(hours, 0)) as hours_actual
  from public.job_actual_costs
  group by job_id
) a on a.job_id = j.id
left join lateral public.job_labour_actual(j.id) lb on true;
