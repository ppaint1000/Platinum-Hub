-- Platinum Painters Hub — staff profiles (shown on proposals) and job
-- checklists (Production board). Run once in the Supabase SQL Editor.
-- Safe to re-run.

-- ── Staff profiles ─────────────────────────────────────────────────────
-- Each person's own details for the "Your contact" box on proposals:
-- phone, title, a short bio, a photo and a signature (images in the public
-- staff-profiles bucket, under the person's own folder).
create table if not exists public.staff_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  title text,
  bio text,
  photo_path text,
  signature_path text,
  updated_at timestamptz not null default now()
);

alter table public.staff_profiles enable row level security;

drop policy if exists staff_profiles_own on public.staff_profiles;
create policy staff_profiles_own on public.staff_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists staff_profiles_admin_select on public.staff_profiles;
create policy staff_profiles_admin_select on public.staff_profiles
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into storage.buckets (id, name, public)
values ('staff-profiles', 'staff-profiles', true)
on conflict (id) do update set public = true;

drop policy if exists staff_profiles_upload_own on storage.objects;
create policy staff_profiles_upload_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'staff-profiles' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists staff_profiles_update_own on storage.objects;
create policy staff_profiles_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'staff-profiles' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists staff_profiles_delete_own on storage.objects;
create policy staff_profiles_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'staff-profiles' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Job checklists ─────────────────────────────────────────────────────
-- The items on the Pre-job and Post-job checklists (admins edit them), and
-- which are ticked on each job (admins and supervisors tick them).
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist text not null check (checklist in ('pre', 'post')),
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.job_checklist_ticks (
  job_id uuid not null references public.jobs(id) on delete cascade,
  item_id uuid not null references public.checklist_items(id) on delete cascade,
  done_by uuid references public.profiles(id) on delete set null,
  done_at timestamptz not null default now(),
  primary key (job_id, item_id)
);

alter table public.checklist_items enable row level security;
alter table public.job_checklist_ticks enable row level security;

drop policy if exists checklist_items_crew_select on public.checklist_items;
create policy checklist_items_crew_select on public.checklist_items
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'supervisor')));

drop policy if exists checklist_items_admin_write on public.checklist_items;
create policy checklist_items_admin_write on public.checklist_items
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists job_checklist_ticks_crew on public.job_checklist_ticks;
create policy job_checklist_ticks_crew on public.job_checklist_ticks
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'supervisor')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'supervisor')));

-- Starting items (only if there are none yet).
insert into public.checklist_items (checklist, label, sort_order)
select v.checklist, v.label, v.sort_order
from (values
  ('pre', 'Colours confirmed with the client', 1),
  ('pre', 'Paint and materials ordered', 2),
  ('pre', 'Access equipment booked (scaffold / EWP)', 3),
  ('pre', 'Site safety plan done', 4),
  ('pre', 'Client told the start date', 5),
  ('pre', 'Crew has read the work order', 6),
  ('post', 'Touch-ups done', 1),
  ('post', 'Site cleaned up and rubbish removed', 2),
  ('post', 'Walk-through with the client and signed off', 3),
  ('post', 'Finished photos taken', 4)
) as v(checklist, label, sort_order)
where not exists (select 1 from public.checklist_items);
