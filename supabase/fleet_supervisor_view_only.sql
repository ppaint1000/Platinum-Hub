-- Platinum Painters Hub — supervisors can view Fleet but only log fuel
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Supervisors previously could create/edit vehicles, service records and
-- other people's fuel entries. They keep read access to everything, and
-- can still log their own fuel (fleet_fuel_insert_own, unchanged) - but
-- every other write is now admin-only. The Fleet screens hide the matching
-- buttons (VehiclesClient / ServicingClient canEdit); this makes sure the
-- database agrees.

-- ── vehicles ────────────────────────────────────────────────────────────
drop policy if exists "fleet_vehicles_insert" on public.vehicles;
create policy "fleet_vehicles_insert" on public.vehicles
  for insert with check (public.current_profile_role() = 'admin');

drop policy if exists "fleet_vehicles_update" on public.vehicles;
create policy "fleet_vehicles_update" on public.vehicles
  for update using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- ── service_records (select for supervisors unchanged) ──────────────────
drop policy if exists "fleet_service_insert" on public.service_records;
create policy "fleet_service_insert" on public.service_records
  for insert with check (public.current_profile_role() = 'admin');

drop policy if exists "fleet_service_update" on public.service_records;
create policy "fleet_service_update" on public.service_records
  for update using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- ── fuel_entries: editing is admin-only (Fuel Log's edit button) ────────
drop policy if exists "fleet_fuel_admin_update" on public.fuel_entries;
create policy "fleet_fuel_admin_update" on public.fuel_entries
  for update using (public.current_profile_role() = 'admin');
