-- Platinum Hub — Measures (formerly Platinum Quotes) integration schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: column/index creation is guarded, same convention as
-- jobs_schema.sql / users_schema.sql / clients_pipeline_schema.sql.
--
-- Measures is a separate app on a separate Supabase project
-- (ghbaleduteyxgotjxsxl, this Hub is qzdrovuhfidpgunlgwpy) — they don't
-- share a database, so Measures pushes customers/quotes into this
-- project's clients/jobs tables via a webhook (see
-- src/app/api/integrations/quotes/). The source_*_id columns hold
-- Measures' own row id so repeated pushes upsert instead of duplicating.

alter table public.clients
  add column if not exists source_quote_customer_id uuid;

-- Plain (not partial) unique index: Postgres never treats two NULLs as
-- conflicting in a unique index, so this already allows unlimited
-- Hub-native clients with no source_quote_customer_id. It has to be plain
-- (no `where ... is not null`) for Supabase's `.upsert(..., { onConflict })`
-- to generate a matching `ON CONFLICT` clause — a partial index needs its
-- predicate repeated in the ON CONFLICT clause itself, which upsert() doesn't do.
create unique index if not exists clients_source_quote_customer_id_idx
  on public.clients(source_quote_customer_id);

alter table public.jobs
  add column if not exists source_quote_id uuid;

create unique index if not exists jobs_source_quote_id_idx
  on public.jobs(source_quote_id);

-- assign_job_number() previously fired only on UPDATE, so a job pushed for
-- the first time already "won" (a quote accepted before this integration
-- existed) would insert straight in as status='won' and never get a job
-- number, since the trigger only watched for a status *transition*. Extend
-- it to fire on INSERT too.
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

drop trigger if exists jobs_assign_job_number on public.jobs;
create trigger jobs_assign_job_number
  before insert or update on public.jobs
  for each row
  execute function public.assign_job_number();
