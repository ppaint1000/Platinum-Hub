-- Platinum Painters Hub — production stages and On Hold.
-- Run in the Supabase SQL Editor in TWO goes: step 1 on its own first
-- (new enum values can't be used in the same transaction they're added in),
-- then step 2. Both safe to re-run.
--
-- Production board (/production): won = "To be scheduled", then
-- scheduled, in_progress, complete ("Job completed"), invoiced, paid.
-- Supervisors can move jobs up to Job completed; only admins mark them
-- Invoiced / Paid. A quote still undecided 8 months after it was quoted
-- goes On Hold automatically (jobs_auto_on_hold, run when admin pages load).

-- ── Step 1 ───────────────────────────────────────────────────────────────
alter type public.job_status add value if not exists 'on_hold';
alter type public.job_status add value if not exists 'scheduled';
alter type public.job_status add value if not exists 'invoiced';
alter type public.job_status add value if not exists 'paid';

-- ── Step 2 ───────────────────────────────────────────────────────────────
alter table public.jobs add column if not exists on_hold_at timestamptz;
alter table public.jobs add column if not exists scheduled_at timestamptz;
alter table public.jobs add column if not exists invoiced_at timestamptz;
alter table public.jobs add column if not exists paid_at timestamptz;

-- The existing stamp trigger, plus: a job number for any won-or-later
-- stage (a job can land straight on Scheduled), and a date for each new
-- stage the first time a job reaches it.
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

  if new.status::text in ('won', 'scheduled', 'in_progress', 'complete', 'invoiced', 'paid')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
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

  if new.status = 'complete'
     and (tg_op = 'INSERT' or old.status is distinct from 'complete')
     and new.completed_at is null then
    new.completed_at := current_date;
  end if;

  if new.status::text = 'on_hold' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.on_hold_at := now();
  end if;
  if new.status::text = 'scheduled' and (tg_op = 'INSERT' or old.status is distinct from new.status) and new.scheduled_at is null then
    new.scheduled_at := now();
  end if;
  if new.status::text = 'invoiced' and (tg_op = 'INSERT' or old.status is distinct from new.status) and new.invoiced_at is null then
    new.invoiced_at := now();
  end if;
  if new.status::text = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) and new.paid_at is null then
    new.paid_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Quotes still undecided 8 months after they were quoted go On Hold.
-- Returns how many moved. Safe for anyone signed in to run - it only ever
-- does this one thing.
create or replace function public.jobs_auto_on_hold()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  update public.jobs
  set status = 'on_hold'
  where status = 'quoted'
    and quoted_at is not null
    and quoted_at <= (current_date - interval '8 months')::date;
  get diagnostics moved = row_count;
  return moved;
end;
$$;

grant execute on function public.jobs_auto_on_hold() to authenticated;

-- The Production board, for admins and supervisors. Supervisors get no $.
create or replace function public.production_jobs()
returns table(
  id uuid,
  job_number text,
  name text,
  client_name text,
  status text,
  value numeric,
  won_at timestamptz,
  scheduled_at timestamptz,
  completed_at date,
  invoiced_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  my_role text;
begin
  select p.role::text into my_role from public.profiles p where p.id = auth.uid();
  if my_role is null or my_role not in ('admin', 'supervisor') then
    raise exception 'Admins and supervisors only';
  end if;
  return query
  select
    j.id,
    j.job_number::text,
    j.name::text,
    c.name::text,
    j.status::text,
    case when my_role = 'admin' then j.quoted_sell_total else null end,
    j.won_at,
    j.scheduled_at,
    j.completed_at,
    j.invoiced_at,
    j.paid_at,
    j.updated_at
  from public.jobs j
  left join public.clients c on c.id = j.client_id
  where j.status::text in ('won', 'scheduled', 'in_progress', 'complete', 'invoiced', 'paid')
  order by j.updated_at desc;
end;
$$;

-- Moving a job on the board. Supervisors: between To be scheduled,
-- Scheduled, In progress and Job completed only. Admins: any stage.
create or replace function public.production_set_status(p_job_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role text;
  current_status text;
  crew text[] := array['won', 'scheduled', 'in_progress', 'complete'];
  board text[] := array['won', 'scheduled', 'in_progress', 'complete', 'invoiced', 'paid'];
begin
  select p.role::text into my_role from public.profiles p where p.id = auth.uid();
  if my_role is null or my_role not in ('admin', 'supervisor') then
    raise exception 'Admins and supervisors only';
  end if;
  select j.status::text into current_status from public.jobs j where j.id = p_job_id;
  if current_status is null or not (current_status = any(board)) then
    raise exception 'That job is not on the production board';
  end if;
  if not (p_status = any(board)) then
    raise exception 'Not a production stage';
  end if;
  if my_role = 'supervisor' and (not (p_status = any(crew)) or not (current_status = any(crew))) then
    raise exception 'Only an admin can move a job to or from Invoiced or Paid';
  end if;
  update public.jobs set status = p_status::public.job_status where id = p_job_id;
end;
$$;

grant execute on function public.production_jobs() to authenticated;
grant execute on function public.production_set_status(uuid, text) to authenticated;
