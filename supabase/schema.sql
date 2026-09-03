-- Platinum Painters Hub — Fleet schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: table creation is guarded, and policies are dropped/recreated.

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  make text not null,
  model text not null,
  year integer,
  current_odometer_km integer,
  assigned_driver_id uuid references public.profiles(id) on delete set null,
  wof_expiry date,
  rego_expiry date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_entries (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  odometer_km integer not null,
  litres numeric(10,2) not null,
  cost_total numeric(10,2) not null,
  cost_per_litre numeric(10,3) generated always as (round(cost_total / nullif(litres, 0), 3)) stored,
  receipt_photo_path text not null,
  odometer_photo_path text not null,
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy_m double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  date date not null,
  odometer_km integer,
  type text,
  description text,
  cost numeric(10,2),
  next_due_date date,
  next_due_odometer_km integer,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;
alter table public.fuel_entries enable row level security;
alter table public.service_records enable row level security;

-- ── profiles: make sure a signed-in user can read their own role ─────────
-- (The Hub needs this to decide admin vs driver routing. Harmless to
-- re-run — if an equivalent policy already exists under a different name,
-- this just adds a second one; Postgres OR's permissive policies together.)

drop policy if exists "fleet_hub_profiles_self_select" on public.profiles;
create policy "fleet_hub_profiles_self_select" on public.profiles
  for select using (auth.uid() = id);

-- admins can see every profile (needed for the Vehicles driver-picker and
-- the Drivers page). Safe self-referencing pattern: the subquery can only
-- ever see the caller's own row (via the policy above), so this can't
-- recurse — it just checks "is my own row's role = admin".
drop policy if exists "fleet_hub_profiles_admin_select_all" on public.profiles;
create policy "fleet_hub_profiles_admin_select_all" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── vehicles: any signed-in user can read (drivers need the picker list),
-- only admins can create/edit/delete ─────────────────────────────────────

drop policy if exists "fleet_vehicles_select_authenticated" on public.vehicles;
create policy "fleet_vehicles_select_authenticated" on public.vehicles
  for select using (auth.role() = 'authenticated');

drop policy if exists "fleet_vehicles_admin_write" on public.vehicles;
create policy "fleet_vehicles_admin_write" on public.vehicles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── fuel_entries: drivers can insert their own and read their own;
-- admins can read/update/delete everything ───────────────────────────────

drop policy if exists "fleet_fuel_insert_own" on public.fuel_entries;
create policy "fleet_fuel_insert_own" on public.fuel_entries
  for insert with check (auth.uid() = driver_id);

drop policy if exists "fleet_fuel_select_own_or_admin" on public.fuel_entries;
create policy "fleet_fuel_select_own_or_admin" on public.fuel_entries
  for select using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "fleet_fuel_admin_update" on public.fuel_entries;
create policy "fleet_fuel_admin_update" on public.fuel_entries
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "fleet_fuel_admin_delete" on public.fuel_entries;
create policy "fleet_fuel_admin_delete" on public.fuel_entries
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── service_records: admin only ───────────────────────────────────────

drop policy if exists "fleet_service_admin_all" on public.service_records;
create policy "fleet_service_admin_all" on public.service_records
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── Storage: private bucket for receipt/odometer photos ─────────────────
-- Each driver's uploads live under a folder named with their own user id
-- (e.g. "3f2a.../1755-receipt.jpg"), which the policies below check.

insert into storage.buckets (id, name, public)
values ('fleet-photos', 'fleet-photos', false)
on conflict (id) do nothing;

drop policy if exists "fleet_photos_insert_own" on storage.objects;
create policy "fleet_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'fleet-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "fleet_photos_select_own_or_admin" on storage.objects;
create policy "fleet_photos_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'fleet-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
  );
