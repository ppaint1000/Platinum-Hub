-- Platinum Painters Hub — auto-stamp jobs.quoted_at the same way won_at
-- already gets auto-stamped, so a job's quoted $ actually lands in the
-- Sales page's monthly figures (src/app/sales/page.tsx buckets quoted $
-- by quoted_at — a job with quoted_sell_total set but a null quoted_at
-- was silently invisible there). Extends the existing assign_job_number()
-- trigger rather than adding a second one, since it already runs before
-- every insert/update on jobs and already does the equivalent for won_at.
-- Run once in the Supabase SQL Editor. Safe to re-run.

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

    new.job_number := 'PP-' || yr || '-' || lpad(seq::text, 3, '0');

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
