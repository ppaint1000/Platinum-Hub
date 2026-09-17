-- Platinum Painters Hub — turn staff_hourly_rates into a dated history
-- Run this once in the Supabase SQL Editor, after
-- staff_hourly_rates_labour_cost.sql has already run. Not safely
-- re-runnable past the primary-key swap below (mirrors the caveat on
-- other "alter an existing table's shape" migrations this session).
--
-- Why: the original design kept one current rate per person, used for
-- every timesheet entry regardless of date. That means a pay rise would
-- silently recalculate every past job that painter ever worked on,
-- completed ones included — not what was wanted. A rate change now
-- inserts a new dated row instead of overwriting the old one, and
-- job_labour_actual() matches each shift to whichever rate was actually
-- in effect on that shift's date (NZ calendar date), so:
--  - correcting a shift's hours still recalculates its $ correctly
--    (using the rate that applied then)
--  - a pay rise only affects work logged from its effective date forward
--  - setting a first-ever rate for someone still covers their existing
--    history (the app inserts it effective from a date well before any
--    real timesheet data, when there's no prior rate on file yet)

alter table public.staff_hourly_rates add column if not exists id uuid default gen_random_uuid();
alter table public.staff_hourly_rates add column if not exists effective_from date;
update public.staff_hourly_rates set effective_from = '2020-01-01' where effective_from is null;
alter table public.staff_hourly_rates alter column effective_from set not null;
alter table public.staff_hourly_rates alter column effective_from set default current_date;

alter table public.staff_hourly_rates drop constraint if exists staff_hourly_rates_pkey;
alter table public.staff_hourly_rates add primary key (id);

create index if not exists staff_hourly_rates_user_effective_idx
  on public.staff_hourly_rates(user_id, effective_from desc);

-- Matches each shift to the rate effective on that shift's NZ calendar
-- date (the latest rate row with effective_from on or before it) rather
-- than a single current rate.
create or replace function public.job_labour_actual(p_job_id uuid)
returns table(amount numeric, hours numeric)
language sql
security definer
set search_path = public
stable
as $$
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
  cross join lateral (
    select
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
    where r.user_id = te.user_id
      and r.effective_from <= (te.clock_in_at at time zone 'Pacific/Auckland')::date
    order by r.effective_from desc
    limit 1
  ) ra
  where s.job_id = p_job_id
    and te.clock_out_at is not null;
$$;
