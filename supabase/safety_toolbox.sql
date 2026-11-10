-- Platinum Painters Hub — Health & safety → Toolbox: toolbox / safety
-- meetings - the date, site, topic (picked from the ideas list or typed),
-- what was talked about, issues raised, actions agreed, and who was there
-- (ticked off from the staff list, plus any visitors by name).
-- Run once in the Supabase SQL Editor, after page_access_and_safety.sql.
-- Safe to re-run.
--
-- Supervisors and admins only (safety_manager(): admin or supervisor, with
-- Health & safety ticked on the Users page). Painters can't see or change
-- these at all.

create table if not exists public.toolbox_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null default ((now() at time zone 'Pacific/Auckland')::date),
  site_id uuid references public.sites(id) on delete set null,
  location text,
  topic text not null,
  -- The ideas-list key the topic came from (blank when typed in).
  topic_key text,
  talking_points text,
  issues text,
  actions text,
  -- Anyone there who isn't on the staff list (subbies, client, visitors).
  visitors text[] not null default '{}',
  led_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists toolbox_meetings_date_idx on public.toolbox_meetings (meeting_date desc);

create table if not exists public.toolbox_attendance (
  meeting_id uuid not null references public.toolbox_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (meeting_id, user_id)
);
create index if not exists toolbox_attendance_user_idx on public.toolbox_attendance (user_id);

alter table public.toolbox_meetings enable row level security;
drop policy if exists toolbox_meetings_all on public.toolbox_meetings;
create policy toolbox_meetings_all on public.toolbox_meetings
  for all using (public.safety_manager()) with check (public.safety_manager());

alter table public.toolbox_attendance enable row level security;
drop policy if exists toolbox_attendance_all on public.toolbox_attendance;
create policy toolbox_attendance_all on public.toolbox_attendance
  for all using (public.safety_manager()) with check (public.safety_manager());

-- Check: should show meetings = 0 (or more) and attendance = 0 (or more).
select
  (select count(*) from public.toolbox_meetings) as meetings,
  (select count(*) from public.toolbox_attendance) as attendance;
