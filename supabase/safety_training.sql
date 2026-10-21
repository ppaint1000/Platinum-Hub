-- Platinum Painters Hub — Health & safety → Training: courses (from the
-- Staff Training Register: Site Safe, Ladder, Mobile scaffold, EWP...
-- admins add and delete more) and each person's training: done (with a
-- date, or in house), to complete, or not required - with a certificate
-- photo/PDF and an expiry.
-- Run once in the Supabase SQL Editor, after page_access_and_safety.sql.
-- Safe to re-run.
--
-- Managers (admins and supervisors with Health & safety ticked -
-- safety_manager()) see and edit everyone's records. Everyone else sees
-- only their own, and can upload a new certificate, which waits as
-- "pending" until a manager approves it.

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- How long the training lasts, to fill in the expiry; blank = doesn't expire.
  valid_months integer check (valid_months is null or valid_months > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists training_courses_name_key on public.training_courses (lower(name));

alter table public.training_courses enable row level security;
drop policy if exists training_courses_select on public.training_courses;
create policy training_courses_select on public.training_courses for select using (public.hub_page_ok('safety'));
drop policy if exists training_courses_write on public.training_courses;
create policy training_courses_write on public.training_courses
  for all using (public.safety_manager()) with check (public.safety_manager());

insert into public.training_courses (name, sort_order)
values
  ('Site Safe construction', 1), ('Grinder', 2), ('Ladder', 3), ('Extension ladder', 4),
  ('Mobile scaffold', 5), ('Water blaster', 6), ('Working at height (scaffold)', 7),
  ('Airless spray', 8), ('Conventional spray', 9), ('EWP (mobile work platform)', 10),
  ('Working at height (roofs)', 11), ('Dehumidifier', 12)
on conflict ((lower(name))) do nothing;

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete restrict,
  -- done (completed_on may be blank for in-house training), to_complete or not_required.
  outcome text not null default 'done' check (outcome in ('done', 'to_complete', 'not_required')),
  completed_on date,
  expires_on date,
  provider text,
  notes text,
  certificate_path text,
  status text not null default 'approved' check (status in ('approved', 'pending')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on is null or completed_on is null or expires_on >= completed_on)
);
-- For a table made before outcomes were added.
alter table public.training_records add column if not exists outcome text not null default 'done';
alter table public.training_records alter column completed_on drop not null;
create index if not exists training_records_user_idx on public.training_records (user_id, course_id, completed_on desc);
create index if not exists training_records_expiry_idx on public.training_records (expires_on) where expires_on is not null;

alter table public.training_records enable row level security;
drop policy if exists training_records_select on public.training_records;
create policy training_records_select on public.training_records
  for select using (public.safety_manager() or user_id = auth.uid());
drop policy if exists training_records_insert on public.training_records;
create policy training_records_insert on public.training_records
  for insert with check (public.safety_manager() or (user_id = auth.uid() and status = 'pending' and public.hub_page_ok('safety')));
drop policy if exists training_records_update on public.training_records;
create policy training_records_update on public.training_records
  for update using (public.safety_manager()) with check (public.safety_manager());
drop policy if exists training_records_delete on public.training_records;
create policy training_records_delete on public.training_records
  for delete using (public.safety_manager() or (user_id = auth.uid() and status = 'pending'));

-- Certificates: private, in a folder per person (<user id>/<file>).
insert into storage.buckets (id, name, public)
values ('training-certificates', 'training-certificates', false)
on conflict (id) do nothing;
drop policy if exists training_files_read on storage.objects;
create policy training_files_read on storage.objects
  for select to authenticated using (
    bucket_id = 'training-certificates'
    and (public.safety_manager() or (storage.foldername(name))[1] = auth.uid()::text)
  );
drop policy if exists training_files_write on storage.objects;
create policy training_files_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'training-certificates'
    and (public.safety_manager() or (storage.foldername(name))[1] = auth.uid()::text)
  );
drop policy if exists training_files_delete on storage.objects;
create policy training_files_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'training-certificates'
    and (public.safety_manager() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Check: should show courses = 3 (or more), records table and bucket = 1.
select
  (select count(*) from public.training_courses) as courses,
  (select count(*) from public.training_records) as records,
  (select count(*) from storage.buckets where id = 'training-certificates') as bucket;
