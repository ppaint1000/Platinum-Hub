-- Platinum Painters Hub — when a job went In progress, so a job just started
-- shows near the top of the clock-in list. Run once in the Supabase SQL
-- Editor. Safe to re-run.
alter table public.jobs add column if not exists in_progress_at timestamptz;

-- Jobs already In progress: their scheduled / won date, else last update.
update public.jobs
set in_progress_at = coalesce(scheduled_at, won_at, updated_at)
where status::text = 'in_progress' and in_progress_at is null;

create or replace function public.jobs_stamp_in_progress()
returns trigger
language plpgsql
as $$
begin
  if new.status::text = 'in_progress' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.in_progress_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_stamp_in_progress on public.jobs;
create trigger jobs_stamp_in_progress
  before insert or update of status on public.jobs
  for each row execute function public.jobs_stamp_in_progress();

select count(*) as in_progress_jobs, count(in_progress_at) as stamped from public.jobs where status::text = 'in_progress';
