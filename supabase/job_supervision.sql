-- Platinum Painters Hub — supervisors' time on jobs: kept OFF the job's
-- hours and labour (so it doesn't eat the painters' hours budget or
-- margin), but costed separately as "Supervision" on each job.
-- Run once in the Supabase SQL Editor, after job_hours_excluded_users.sql.
-- Safe to re-run.
--
-- Supervisors go on job_hours_excluded_users automatically (and come off
-- if they stop being a supervisor), so none of their hours count on jobs,
-- wait for approval or raise the "no hourly rate" flag.

insert into public.job_hours_excluded_users (user_id, reason)
select id, 'Supervisor'
from public.profiles
where role::text = 'supervisor'
on conflict (user_id) do nothing;

create or replace function public.sync_supervisor_hours_exclusion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role::text = 'supervisor' then
    insert into public.job_hours_excluded_users (user_id, reason)
    values (new.id, 'Supervisor')
    on conflict (user_id) do nothing;
  elsif tg_op = 'UPDATE' and old.role::text = 'supervisor' then
    delete from public.job_hours_excluded_users where user_id = new.id and reason = 'Supervisor';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_supervisor_hours_exclusion on public.profiles;
create trigger profiles_supervisor_hours_exclusion
  after insert or update of role on public.profiles
  for each row execute function public.sync_supervisor_hours_exclusion();

-- Supervision on a job: every finished shift by a supervisor at the job's
-- site(s), at their hourly rate on the day (same loaded rate as labour).
create or replace function public.job_supervision(p_job_id uuid)
returns table(amount numeric, hours numeric, missing_rate boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(sum(
      (extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
        - coalesce(te.break_minutes, 0) / 60.0)
      * coalesce(ra.effective_rate, 0)
    ), 0)::numeric(12,2) as amount,
    coalesce(sum(
      extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
        - coalesce(te.break_minutes, 0) / 60.0
    ), 0)::numeric(10,2) as hours,
    coalesce(bool_or(coalesce(ra.effective_rate, 0) = 0), false) as missing_rate
  from public.timesheet_entries te
  join public.sites s on s.id = te.site_id
  join public.profiles p on p.id = te.user_id
  left join lateral (
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
  ) ra on true
  where s.job_id = p_job_id
    and te.clock_out_at is not null
    and p.role::text = 'supervisor';
$$;

-- Check: supervisors now excluded from job hours.
select p.full_name, x.reason
from public.job_hours_excluded_users x join public.profiles p on p.id = x.user_id
order by 1;
