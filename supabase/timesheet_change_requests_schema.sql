-- Platinum Painters Hub — Timesheet change requests
-- Run this once in the Supabase SQL Editor (same project as the rest of
-- Timesheets/Jobs). Safe to re-run — every statement is idempotent.
--
-- Why: painters used to be able to edit their own clock in/out times (and
-- which site/job a shift was against) directly on
-- /timesheets/timesheet/weekly (updateTimesheetEntry). That's being
-- removed — painters can no longer change a punch themselves, ever.
-- Instead they submit a request here (which field(s) — start, finish,
-- and/or site — plus the new value and a required comment); it goes to
-- the office the same way a confirmed timesheet does (an email), and an
-- admin approves (applies the requested value(s) to the entry) or rejects
-- it from /timesheets/admin/change-requests.

create table if not exists public.timesheet_change_requests (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.timesheet_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  requested_clock_in_at timestamptz,
  requested_clock_out_at timestamptz,
  requested_site_id uuid references public.sites(id),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  admin_notes text,
  constraint timesheet_change_requests_at_least_one_field check (
    requested_clock_in_at is not null
    or requested_clock_out_at is not null
    or requested_site_id is not null
  )
);

create index if not exists timesheet_change_requests_user_id_idx
  on public.timesheet_change_requests(user_id);
create index if not exists timesheet_change_requests_entry_id_idx
  on public.timesheet_change_requests(entry_id);
create index if not exists timesheet_change_requests_status_idx
  on public.timesheet_change_requests(status);

alter table public.timesheet_change_requests enable row level security;

-- A painter sees only their own requests; an admin sees every request.
drop policy if exists "timesheet_change_requests_select" on public.timesheet_change_requests;
create policy "timesheet_change_requests_select" on public.timesheet_change_requests
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- A painter can only ever file a request for themselves.
drop policy if exists "timesheet_change_requests_insert" on public.timesheet_change_requests;
create policy "timesheet_change_requests_insert" on public.timesheet_change_requests
  for insert with check (auth.uid() = user_id);

-- Only an admin resolves a request (approve/reject) — painters have no
-- update policy at all, so they truly cannot self-approve or edit theirs
-- after filing it.
drop policy if exists "timesheet_change_requests_admin_update" on public.timesheet_change_requests;
create policy "timesheet_change_requests_admin_update" on public.timesheet_change_requests
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
