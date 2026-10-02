-- Platinum Painters Hub — people whose timesheet hours never go on jobs
-- (testing accounts). Run once in the Supabase SQL Editor, after
-- job_hours_no_rate_flag.sql. Safe to re-run.
--
-- Their timesheets are untouched; their hours just never count on a job,
-- never wait for approval and never raise the "no hourly rate" flag.

create table if not exists public.job_hours_excluded_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.job_hours_excluded_users enable row level security;

drop policy if exists job_hours_excluded_users_admin_all on public.job_hours_excluded_users;
create policy job_hours_excluded_users_admin_all on public.job_hours_excluded_users
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

insert into public.job_hours_excluded_users (user_id, reason)
select id, 'Testing hours only'
from public.profiles
where full_name in ('Test painter', 'Nigel Richmond')
on conflict (user_id) do nothing;

-- Their old approvals go - nothing of theirs is on a job.
delete from public.job_hours_approvals ap
using public.timesheet_entries te
where te.id = ap.entry_id
  and te.user_id in (select user_id from public.job_hours_excluded_users);

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
      * coalesce(ra.effective_rate, 0)
    ), 0)::numeric(12,2) as amount,
    coalesce(sum(
      extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
        - coalesce(te.break_minutes, 0) / 60.0
    ), 0)::numeric(10,2) as hours
  from public.timesheet_entries te
  join public.sites s on s.id = te.site_id
  join public.job_hours_approvals ap on ap.entry_id = te.id
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
    and not exists (select 1 from public.job_hours_excluded_users x where x.user_id = te.user_id);
$$;

create or replace function public.job_hours_pending(p_job_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(
    extract(epoch from (te.clock_out_at - te.clock_in_at)) / 3600.0
      - coalesce(te.break_minutes, 0) / 60.0
  ), 0)::numeric(10,2)
  from public.timesheet_entries te
  join public.sites s on s.id = te.site_id
  where s.job_id = p_job_id
    and te.clock_out_at is not null
    and not exists (select 1 from public.job_hours_approvals ap where ap.entry_id = te.id)
    and not exists (select 1 from public.job_hours_excluded_users x where x.user_id = te.user_id);
$$;

create or replace function public.job_hours_entries(p_since timestamptz default null)
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
    and not exists (select 1 from public.job_hours_excluded_users x where x.user_id = te.user_id)
  order by te.clock_in_at;
end;
$$;

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
    and not exists (select 1 from public.job_hours_excluded_users x where x.user_id = te.user_id)
    and not exists (
      select 1 from public.staff_hourly_rates r
      where r.user_id = te.user_id
        and r.effective_from <= (te.clock_in_at at time zone 'Pacific/Auckland')::date
    )
  group by te.user_id
  order by 3 desc;
end;
$$;
