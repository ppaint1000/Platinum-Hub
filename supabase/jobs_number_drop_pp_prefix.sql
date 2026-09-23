-- Platinum Painters Hub — drop the "PP-" prefix from new job numbers
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Job numbers were "PP-26-038"; new ones become "26-038". Only affects
-- jobs won from here on — existing job_number values already assigned
-- (e.g. "PP-26-038") are left as they are, so nothing on an already-won
-- job changes underneath it.

create or replace function public.assign_job_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  yr text := to_char(now(), 'YY');
  seq integer;
begin
  if new.status = 'quoted'
     and (tg_op = 'INSERT' or old.status is distinct from 'quoted')
     and new.quoted_at is null then
    new.quoted_at := current_date;
  end if;

  if new.status = 'won'
     and (tg_op = 'INSERT' or old.status is distinct from 'won')
     and new.job_number is null then
    insert into public.job_number_counters (year_code, last_seq)
    values (yr, 1)
    on conflict (year_code) do update set last_seq = public.job_number_counters.last_seq + 1
    returning last_seq into seq;

    new.job_number := yr || '-' || lpad(seq::text, 3, '0');

    if new.won_at is null then
      new.won_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Trigger itself is unchanged (still fires before insert or update on
-- every row) — re-created here only so this file is a complete, runnable
-- record of the current trigger wiring.
drop trigger if exists jobs_assign_job_number on public.jobs;
create trigger jobs_assign_job_number
  before insert or update on public.jobs
  for each row
  execute function public.assign_job_number();
