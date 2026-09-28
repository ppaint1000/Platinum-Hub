-- Platinum Painters Hub — staff absences.
--
-- From 9am NZ on a working day, whenever an admin opens a page with the top
-- bar, the Hub checks who (active staff with Timesheets ticked, not admins
-- or supervisors - their absences are recorded by hand) hasn't clocked in, skipping NZ public holidays incl. Auckland Anniversary
-- and any closed day below. Each person not in gets a row here with no type
-- yet, and the Absences tab lights up until an admin records why. Admins can
-- also record an absence ahead of time, so that day isn't flagged.
--
-- Admin-only: the check itself runs with the service role.

create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  absence_date date not null,
  -- null until an admin records why
  absence_type text check (absence_type in ('sick', 'authorised_leave', 'unauthorised_leave', 'not_rostered')),
  reason text,
  -- true when the 9am check created it, false when an admin added it
  flagged_by_check boolean not null default true,
  created_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz,
  unique (user_id, absence_date)
);

create index if not exists absences_date_idx on public.absences (absence_date);
create index if not exists absences_pending_idx on public.absences (absence_date) where absence_type is null;

alter table public.absences enable row level security;

drop policy if exists "absences_admin_all" on public.absences;
create policy "absences_admin_all" on public.absences
  for all using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- Days the business is closed that aren't public holidays (e.g. the
-- Christmas shutdown). No 9am check runs on these days.
create table if not exists public.closed_days (
  day date primary key,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.closed_days enable row level security;

drop policy if exists "closed_days_admin_all" on public.closed_days;
create policy "closed_days_admin_all" on public.closed_days
  for all using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');
