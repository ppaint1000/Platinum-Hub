-- Platinum Painters Hub — timesheet hours only count on a job once an admin
-- approves them (Jobs → Hours to approve).
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- An approval is one row per timesheet entry. Changing an approved shift's
-- times, break, site or person takes the approval away again, so the
-- changed hours go back into the queue. Never changes timesheets
-- themselves or the timesheet reports.
--
-- job_labour_actual() (staff_hourly_rates_history.sql) now counts approved
-- entries only, and counts everyone's hours - someone with no hourly rate
-- on file adds hours at $0 instead of being left out.

create table if not exists public.job_hours_approvals (
  entry_id uuid primary key references public.timesheet_entries(id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null
);

alter table public.job_hours_approvals enable row level security;

drop policy if exists job_hours_approvals_admin_all on public.job_hours_approvals;
create policy job_hours_approvals_admin_all on public.job_hours_approvals
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- A changed shift needs approving again.
create or replace function public.job_hours_unapprove_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.clock_in_at is distinct from old.clock_in_at
     or new.clock_out_at is distinct from old.clock_out_at
     or new.break_minutes is distinct from old.break_minutes
     or new.site_id is distinct from old.site_id
     or new.user_id is distinct from old.user_id then
    delete from public.job_hours_approvals where entry_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists job_hours_unapprove_changed on public.timesheet_entries;
create trigger job_hours_unapprove_changed
  after update on public.timesheet_entries
  for each row execute function public.job_hours_unapprove_changed();

-- Approved hours only; each shift at the rate in effect on its NZ date.
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
    and te.clock_out_at is not null;
$$;

-- Hours on a job still waiting for approval (shown on the job page).
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
    and not exists (select 1 from public.job_hours_approvals ap where ap.entry_id = te.id);
$$;

-- Every finished shift on a job site, with whether it's approved - for the
-- Hours to approve page. Admins only (checked here, as it reads past RLS).
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
  approved_by_name text
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
    apr.full_name::text
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

grant execute on function public.job_hours_pending(uuid) to authenticated;
grant execute on function public.job_hours_entries(timestamptz) to authenticated;

-- Everything logged before approvals started counts as approved, so job
-- figures don't change on the day this goes live. Only on the very first
-- run (while there are no approvals yet), so re-running this file never
-- approves hours that are waiting.
insert into public.job_hours_approvals (entry_id, approved_at)
select te.id, now()
from public.timesheet_entries te
join public.sites s on s.id = te.site_id
where s.job_id is not null
  and te.clock_out_at is not null
  and not exists (select 1 from public.job_hours_approvals)
on conflict (entry_id) do nothing;
