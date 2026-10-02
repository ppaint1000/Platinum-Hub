-- Platinum Painters Hub — flag painters with job hours but no hourly rate.
-- Run once in the Supabase SQL Editor, after job_hours_approvals.sql.
-- Safe to re-run.
--
-- Their hours still count on jobs, but at $0 until a rate is set on the
-- Users page (a first rate covers their past shifts too). Shown to admins
-- on Hours to approve and as a red count on the Users tab.

-- job_hours_entries gains has_rate (changing a function's columns needs a
-- drop first).
drop function if exists public.job_hours_entries(timestamptz);
create function public.job_hours_entries(p_since timestamptz default null)
returns table(
  entry_id uuid,
  user_id uuid,
  person text,
  job_id uuid,
  job_number text,
  job_name text,
  site_name text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  break_minutes integer,
  hours numeric,
  approved_at timestamptz,
  approved_by_name text,
  has_rate boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Admins only';
  end if;
  return query
  select
    te.id,
    te.user_id,
    pr.full_name::text,
    j.id,
    j.job_number::text,
    j.name::text,
    s.name::text,
    te.clock_in_at,
    te.clock_out_at,
    te.break_minutes::integer,
    (extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
      - coalesce(te.break_minutes, 0) / 60.0)::numeric(10,2),
    ap.approved_at,
    apr.full_name::text,
    exists (
      select 1 from public.staff_hourly_rates r
      where r.user_id = te.user_id
        and r.effective_from <= (te.clock_in_at at time zone 'Pacific/Auckland')::date
    )
  from public.timesheet_entries te
  join public.sites s on s.id = te.site_id
  join public.jobs j on j.id = s.job_id
  left join public.profiles pr on pr.id = te.user_id
  left join public.job_hours_approvals ap on ap.entry_id = te.id
  left join public.profiles apr on apr.id = ap.approved_by
  where te.clock_out_at is not null
    and (ap.entry_id is null or p_since is null or ap.approved_at >= p_since)
  order by te.clock_in_at;
end;
$$;

-- Everyone with hours on jobs that have no rate for that day (approved or
-- not), and how many hours. Admins only.
create or replace function public.job_hours_no_rate()
returns table(user_id uuid, person text, hours numeric, shifts bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Admins only';
  end if;
  return query
  select
    te.user_id,
    max(pr.full_name)::text,
    sum(extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
      - coalesce(te.break_minutes, 0) / 60.0)::numeric(10,2),
    count(*)
  from public.timesheet_entries te
  join public.sites s on s.id = te.site_id
  left join public.profiles pr on pr.id = te.user_id
  where s.job_id is not null
    and te.clock_out_at is not null
    and not exists (
      select 1 from public.staff_hourly_rates r
      where r.user_id = te.user_id
        and r.effective_from <= (te.clock_in_at at time zone 'Pacific/Auckland')::date
    )
  group by te.user_id
  order by 3 desc;
end;
$$;

grant execute on function public.job_hours_entries(timestamptz) to authenticated;
grant execute on function public.job_hours_no_rate() to authenticated;
