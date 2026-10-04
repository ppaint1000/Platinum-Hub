-- Platinum Painters Hub — the Schedule calendar, and proposals the customer
-- can decline online, that expire, and that remind the customer.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- ── Schedule: which crew is on which job, which days ─────────────────────

create table if not exists public.job_bookings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  crew uuid[] not null default '{}',
  notes text,
  -- The customer's "your job is booked" email and the day-before reminder.
  email_customer boolean not null default false,
  remind_customer boolean not null default false,
  customer_emailed_at timestamptz,
  customer_reminded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_bookings_dates check (end_date >= start_date)
);

create index if not exists job_bookings_dates_idx on public.job_bookings (start_date, end_date);
create index if not exists job_bookings_job_idx on public.job_bookings (job_id);

alter table public.job_bookings enable row level security;

drop policy if exists job_bookings_staff_all on public.job_bookings;
create policy job_bookings_staff_all on public.job_bookings
  for all using (public.current_profile_role() in ('admin', 'supervisor'))
  with check (public.current_profile_role() in ('admin', 'supervisor'));

-- Painters see the bookings they're on (their "My jobs").
drop policy if exists job_bookings_crew_select on public.job_bookings;
create policy job_bookings_crew_select on public.job_bookings
  for select using (auth.uid() = any(crew));

-- Who goes on the calendar: active painters and supervisors, plus anyone
-- else with Timesheets ticked. Admins and supervisors only.
create or replace function public.schedule_staff()
returns table(id uuid, full_name text, role text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if public.current_profile_role() not in ('admin', 'supervisor') then
    raise exception 'Admins and supervisors only';
  end if;
  return query
  select p.id, p.full_name::text, p.role::text
  from public.profiles p
  left join public.user_app_access a on a.user_id = p.id
  where coalesce(p.is_active, true) and p.deleted_at is null
    and (p.role::text in ('painter', 'supervisor') or coalesce(a.timesheets, false))
  order by case p.role::text when 'supervisor' then 0 when 'painter' then 1 else 2 end, p.full_name;
end;
$$;

-- The jobs that can be booked (won through to complete, and any job that
-- already has a booking), with the site address and the crew's work order.
create or replace function public.schedule_jobs()
returns table(id uuid, job_number text, name text, client_name text, status text, address text, work_order_url text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if public.current_profile_role() not in ('admin', 'supervisor') then
    raise exception 'Admins and supervisors only';
  end if;
  return query
  select j.id, j.job_number::text, j.name::text, c.name::text, j.status::text,
         coalesce(nullif(trim(pr.site_address), ''), nullif(trim(c.address), ''))::text,
         j.work_order_url::text
  from public.jobs j
  left join public.clients c on c.id = j.client_id
  left join public.proposals pr on pr.quote_id = j.source_quote_id
  where j.status::text in ('won', 'scheduled', 'in_progress', 'complete')
     or exists (select 1 from public.job_bookings b where b.job_id = j.id and b.end_date >= current_date - 60)
  order by j.name;
end;
$$;

-- Who's away (from Absences) on the calendar. Admins and supervisors only.
create or replace function public.schedule_absences(p_from date, p_to date)
returns table(user_id uuid, absence_date date, absence_type text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if public.current_profile_role() not in ('admin', 'supervisor') then
    raise exception 'Admins and supervisors only';
  end if;
  return query
  select a.user_id, a.absence_date, a.absence_type::text
  from public.absences a
  where a.absence_date between p_from and p_to;
end;
$$;

-- A painter's own bookings, with the job's details (painters can't read
-- jobs directly).
create or replace function public.my_bookings(p_from date, p_to date)
returns table(id uuid, start_date date, end_date date, notes text, job_name text, job_number text,
              client_name text, address text, work_order_url text, crew_names text[])
language sql
security definer
set search_path = public
stable
as $$
  select b.id, b.start_date, b.end_date, b.notes, j.name::text, j.job_number::text, c.name::text,
         coalesce(nullif(trim(pr.site_address), ''), nullif(trim(c.address), ''))::text,
         j.work_order_url::text,
         array(select p.full_name::text from public.profiles p where p.id = any(b.crew) order by p.full_name)
  from public.job_bookings b
  join public.jobs j on j.id = b.job_id
  left join public.clients c on c.id = j.client_id
  left join public.proposals pr on pr.quote_id = j.source_quote_id
  where auth.uid() = any(b.crew) and b.end_date >= p_from and b.start_date <= p_to
  order by b.start_date;
$$;

grant execute on function public.schedule_staff() to authenticated;
grant execute on function public.schedule_jobs() to authenticated;
grant execute on function public.schedule_absences(date, date) to authenticated;
grant execute on function public.my_bookings(date, date) to authenticated;

-- ── Proposals: decline online, expiry, customer reminder ─────────────────

alter table public.proposals add column if not exists declined_at timestamptz;
alter table public.proposals add column if not exists declined_name text;
alter table public.proposals add column if not exists declined_reason text;
alter table public.proposals add column if not exists declined_to text;
alter table public.proposals add column if not exists expires_on date;
alter table public.proposals add column if not exists customer_reminded_at timestamptz;

-- How long a proposal is valid for after it's sent, and when the customer
-- gets a reminder (0 = no reminder). Settings → Proposal templates.
alter table public.proposal_settings add column if not exists valid_days integer not null default 30;
alter table public.proposal_settings add column if not exists customer_reminder_days integer not null default 7;

create or replace function public.proposal_decline(p_token text, p_name text, p_reason text, p_declined_to text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prop public.proposals;
begin
  if not public.proposal_code_ok(p_token, p_code) then
    return jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  end if;
  select * into prop from public.proposals where token = p_token for update;
  if prop.id is null then
    return jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  end if;
  if prop.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This proposal has already been accepted.');
  end if;
  if prop.declined_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This proposal has already been declined.');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Please choose a reason.');
  end if;

  update public.proposals set
    declined_at = now(),
    declined_name = left(nullif(trim(p_name), ''), 200),
    declined_reason = left(trim(p_reason), 500),
    declined_to = left(nullif(trim(p_declined_to), ''), 200)
  where id = prop.id;

  update public.quotes set status = 'declined' where id = prop.quote_id;

  return jsonb_build_object('ok', true, 'quote_id', prop.quote_id);
end;
$$;

grant execute on function public.proposal_decline(text, text, text, text, text) to anon, authenticated;

-- Accepting: as before, but not once it's declined or past its expiry date.
create or replace function public.proposal_accept(p_token text, p_name text, p_signature text, p_options jsonb, p_total numeric, p_user_agent text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prop public.proposals;
begin
  if not public.proposal_code_ok(p_token, p_code) then
    return jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  end if;
  select * into prop from public.proposals where token = p_token for update;
  if prop.id is null then
    return jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  end if;
  if prop.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This proposal has already been accepted.');
  end if;
  if prop.declined_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This proposal was declined. Please contact us for a new one.');
  end if;
  if prop.expires_on is not null and prop.expires_on < (now() at time zone 'Pacific/Auckland')::date then
    return jsonb_build_object('ok', false, 'error', 'This proposal has expired. Please contact us and we''ll renew it.');
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(p_signature, '') not like 'data:image/png;base64,%' then
    return jsonb_build_object('ok', false, 'error', 'Please type your name and sign.');
  end if;

  update public.proposals set
    accepted_at = now(),
    accepted_name = left(trim(p_name), 200),
    accepted_signature = left(p_signature, 400000),
    accepted_options = coalesce(p_options, '[]'::jsonb),
    accepted_total = p_total,
    accepted_user_agent = left(p_user_agent, 300)
  where id = prop.id;

  update public.quotes set status = 'accepted' where id = prop.quote_id;

  return jsonb_build_object('ok', true, 'quote_id', prop.quote_id);
end;
$$;

grant execute on function public.proposal_accept(text, text, text, jsonb, numeric, text, text) to anon, authenticated;

-- Check: should show bookings_table = 1, decline_columns = 6, settings_columns = 2.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'job_bookings') as bookings_table,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proposals'
     and column_name in ('declined_at','declined_name','declined_reason','declined_to','expires_on','customer_reminded_at')) as decline_columns,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proposal_settings'
     and column_name in ('valid_days','customer_reminder_days')) as settings_columns;
