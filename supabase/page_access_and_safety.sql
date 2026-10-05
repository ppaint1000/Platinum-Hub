-- Platinum Painters Hub — a tick per page on the Users page (Production
-- board, Schedule, Health & safety join the existing ticks), and the Health
-- & safety section (like HazardCo): reports, incidents, hazard register,
-- tasks, documents and contractors.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- ── Page ticks ─────────────────────────────────────────────────────────

alter table public.user_app_access add column if not exists production boolean not null default false;
alter table public.user_app_access add column if not exists schedule boolean not null default false;
alter table public.user_app_access add column if not exists safety boolean not null default false;

-- Supervisors keep what they had (the Production board and Schedule were
-- theirs by role); supervisors and painters get Health & safety.
update public.user_app_access a set production = true, schedule = true, safety = true
from public.profiles p
where p.id = a.user_id and p.role::text = 'supervisor' and not (a.production and a.schedule and a.safety);
update public.user_app_access a set safety = true
from public.profiles p
where p.id = a.user_id and p.role::text = 'painter' and not a.safety;

-- Can the signed-in person use this page? Admins always can.
create or replace function public.hub_page_ok(p_page text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select case
       when p.role::text = 'admin' then true
       when p_page = 'production' then coalesce(a.production, false)
       when p_page = 'schedule' then coalesce(a.schedule, false)
       when p_page = 'safety' then coalesce(a.safety, false)
       else false
     end
     from public.profiles p
     left join public.user_app_access a on a.user_id = p.id
     where p.id = auth.uid() and coalesce(p.is_active, true) and p.deleted_at is null),
    false);
$$;
grant execute on function public.hub_page_ok(text) to authenticated;

-- Production board: by the tick now, not the role. Non-admins see no $ and
-- can't move jobs to or from Invoiced / Paid (as supervisors before).
create or replace function public.production_jobs()
returns table(
  id uuid, job_number text, name text, client_name text, status text, value numeric,
  won_at timestamptz, scheduled_at timestamptz, completed_at date,
  invoiced_at timestamptz, paid_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  is_admin boolean := public.current_profile_role() = 'admin';
begin
  if not public.hub_page_ok('production') then
    raise exception 'No access to the Production board';
  end if;
  return query
  select j.id, j.job_number::text, j.name::text, c.name::text, j.status::text,
         case when is_admin then j.quoted_sell_total else null end,
         j.won_at, j.scheduled_at, j.completed_at, j.invoiced_at, j.paid_at, j.updated_at
  from public.jobs j
  left join public.clients c on c.id = j.client_id
  where j.status::text in ('won', 'scheduled', 'in_progress', 'complete', 'invoiced', 'paid')
  order by j.updated_at desc;
end;
$$;

create or replace function public.production_set_status(p_job_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := public.current_profile_role() = 'admin';
  current_status text;
  crew text[] := array['won', 'scheduled', 'in_progress', 'complete'];
  board text[] := array['won', 'scheduled', 'in_progress', 'complete', 'invoiced', 'paid'];
begin
  if not public.hub_page_ok('production') and not public.hub_page_ok('schedule') then
    raise exception 'No access to the Production board';
  end if;
  select j.status::text into current_status from public.jobs j where j.id = p_job_id;
  if current_status is null or not (current_status = any(board)) then
    raise exception 'That job is not on the production board';
  end if;
  if not (p_status = any(board)) then
    raise exception 'Not a production stage';
  end if;
  if not is_admin and (not (p_status = any(crew)) or not (current_status = any(crew))) then
    raise exception 'Only an admin can move a job to or from Invoiced or Paid';
  end if;
  update public.jobs set status = p_status::public.job_status where id = p_job_id;
end;
$$;

-- Job checklists on the Production board.
drop policy if exists checklist_items_crew_select on public.checklist_items;
create policy checklist_items_crew_select on public.checklist_items
  for select using (public.hub_page_ok('production'));
drop policy if exists job_checklist_ticks_crew on public.job_checklist_ticks;
create policy job_checklist_ticks_crew on public.job_checklist_ticks
  for all using (public.hub_page_ok('production')) with check (public.hub_page_ok('production'));

-- Schedule: by the tick.
drop policy if exists job_bookings_staff_all on public.job_bookings;
create policy job_bookings_staff_all on public.job_bookings
  for all using (public.hub_page_ok('schedule')) with check (public.hub_page_ok('schedule'));

create or replace function public.schedule_staff()
returns table(id uuid, full_name text, role text)
language plpgsql security definer set search_path = public stable
as $$
begin
  if not public.hub_page_ok('schedule') then raise exception 'No access to the Schedule'; end if;
  return query
  select p.id, p.full_name::text, p.role::text
  from public.profiles p
  left join public.user_app_access a on a.user_id = p.id
  where coalesce(p.is_active, true) and p.deleted_at is null
    and (p.role::text in ('painter', 'supervisor') or coalesce(a.timesheets, false))
  order by case p.role::text when 'supervisor' then 0 when 'painter' then 1 else 2 end, p.full_name;
end;
$$;

create or replace function public.schedule_jobs()
returns table(id uuid, job_number text, name text, client_name text, status text, address text, work_order_url text)
language plpgsql security definer set search_path = public stable
as $$
begin
  if not public.hub_page_ok('schedule') then raise exception 'No access to the Schedule'; end if;
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

create or replace function public.schedule_absences(p_from date, p_to date)
returns table(user_id uuid, absence_date date, absence_type text)
language plpgsql security definer set search_path = public stable
as $$
begin
  if not public.hub_page_ok('schedule') then raise exception 'No access to the Schedule'; end if;
  return query
  select a.user_id, a.absence_date, a.absence_type::text
  from public.absences a
  where a.absence_date between p_from and p_to;
end;
$$;

-- Admins and supervisors manage safety (see everyone's reports, set tasks,
-- keep the hazard register); everyone with the tick fills in reports.
create or replace function public.safety_manager()
returns boolean
language sql security definer stable set search_path = public
as $$
  select public.current_profile_role() in ('admin', 'supervisor') and public.hub_page_ok('safety');
$$;
grant execute on function public.safety_manager() to authenticated;

-- ── Health & safety: reports (incl. incidents) ───────────────────────────

create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  status text not null default 'completed' check (status in ('draft', 'completed')),
  site_id uuid references public.sites(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  location text,
  report_date date not null default ((now() at time zone 'Pacific/Auckland')::date),
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists safety_reports_type_idx on public.safety_reports (report_type, report_date desc);
alter table public.safety_reports enable row level security;

drop policy if exists safety_reports_select on public.safety_reports;
create policy safety_reports_select on public.safety_reports
  for select using (public.safety_manager() or (public.hub_page_ok('safety') and created_by = auth.uid()));
drop policy if exists safety_reports_insert on public.safety_reports;
create policy safety_reports_insert on public.safety_reports
  for insert with check (public.hub_page_ok('safety') and created_by = auth.uid());
drop policy if exists safety_reports_update on public.safety_reports;
create policy safety_reports_update on public.safety_reports
  for update using (public.safety_manager() or (public.hub_page_ok('safety') and created_by = auth.uid()));
drop policy if exists safety_reports_delete on public.safety_reports;
create policy safety_reports_delete on public.safety_reports
  for delete using (public.current_profile_role() = 'admin');

-- ── Hazard register ─────────────────────────────────────────────────────

create table if not exists public.safety_hazards (
  id uuid primary key default gen_random_uuid(),
  hazard text not null,
  harm text,
  risk_before text check (risk_before in ('low', 'medium', 'high', 'extreme')),
  controls text,
  risk_after text check (risk_after in ('low', 'medium', 'high', 'extreme')),
  responsible text,
  review_on date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.safety_hazards enable row level security;
drop policy if exists safety_hazards_select on public.safety_hazards;
create policy safety_hazards_select on public.safety_hazards for select using (public.hub_page_ok('safety'));
drop policy if exists safety_hazards_write on public.safety_hazards;
create policy safety_hazards_write on public.safety_hazards
  for all using (public.safety_manager()) with check (public.safety_manager());

-- ── Tasks ───────────────────────────────────────────────────────────────

create table if not exists public.safety_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  assigned_to uuid references public.profiles(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  due_on date,
  status text not null default 'open' check (status in ('open', 'done')),
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.safety_tasks enable row level security;
drop policy if exists safety_tasks_select on public.safety_tasks;
create policy safety_tasks_select on public.safety_tasks
  for select using (public.safety_manager() or (public.hub_page_ok('safety') and (assigned_to = auth.uid() or created_by = auth.uid())));
drop policy if exists safety_tasks_insert on public.safety_tasks;
create policy safety_tasks_insert on public.safety_tasks
  for insert with check (public.hub_page_ok('safety') and created_by = auth.uid());
drop policy if exists safety_tasks_update on public.safety_tasks;
create policy safety_tasks_update on public.safety_tasks
  for update using (public.safety_manager() or (public.hub_page_ok('safety') and (assigned_to = auth.uid() or created_by = auth.uid())));
drop policy if exists safety_tasks_delete on public.safety_tasks;
create policy safety_tasks_delete on public.safety_tasks for delete using (public.safety_manager());

-- ── Documents ───────────────────────────────────────────────────────────

create table if not exists public.safety_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'general' check (category in ('general', 'hazard', 'accident', 'worker', 'contractor', 'other')),
  storage_path text not null,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.safety_documents enable row level security;
drop policy if exists safety_documents_select on public.safety_documents;
create policy safety_documents_select on public.safety_documents for select using (public.hub_page_ok('safety'));
drop policy if exists safety_documents_write on public.safety_documents;
create policy safety_documents_write on public.safety_documents
  for all using (public.safety_manager()) with check (public.safety_manager());

insert into storage.buckets (id, name, public)
values ('safety-documents', 'safety-documents', false)
on conflict (id) do nothing;
drop policy if exists safety_documents_files_read on storage.objects;
create policy safety_documents_files_read on storage.objects
  for select to authenticated using (bucket_id = 'safety-documents' and public.hub_page_ok('safety'));
drop policy if exists safety_documents_files_write on storage.objects;
create policy safety_documents_files_write on storage.objects
  for insert to authenticated with check (bucket_id = 'safety-documents' and public.safety_manager());
drop policy if exists safety_documents_files_delete on storage.objects;
create policy safety_documents_files_delete on storage.objects
  for delete to authenticated using (bucket_id = 'safety-documents' and public.safety_manager());

-- ── Contractors (subbies) ───────────────────────────────────────────────

create table if not exists public.safety_contractors (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text,
  email text,
  phone text,
  trades text,
  prequal_status text not null default 'not_started' check (prequal_status in ('not_started', 'requested', 'approved', 'declined')),
  prequal_expires_on date,
  insurance_expires_on date,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.safety_contractors enable row level security;
drop policy if exists safety_contractors_all on public.safety_contractors;
create policy safety_contractors_all on public.safety_contractors
  for all using (public.safety_manager()) with check (public.safety_manager());

-- Check: should show page_columns = 3, safety_tables = 5, bucket = 1.
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'user_app_access'
     and column_name in ('production', 'schedule', 'safety')) as page_columns,
  (select count(*) from information_schema.tables where table_schema = 'public'
     and table_name in ('safety_reports', 'safety_hazards', 'safety_tasks', 'safety_documents', 'safety_contractors')) as safety_tables,
  (select count(*) from storage.buckets where id = 'safety-documents') as bucket;
