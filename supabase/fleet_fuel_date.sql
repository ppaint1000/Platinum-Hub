-- Platinum Painters Hub — fuel entries get the fill-up date itself, the
-- odometer photo becomes optional, and admins can add entries manually
-- Run once in the Supabase SQL Editor, after fleet_waterblaster_fuel.sql.
-- Safe to re-run.
--
-- created_at is when the entry was saved, which isn't always the day the
-- tank was filled (a receipt logged the next morning). The driver form now
-- has a Date box, pre-filled from the receipt, stored here.

alter table public.fuel_entries add column if not exists fuelled_on date;

-- Existing entries: best available answer is the day they were logged.
update public.fuel_entries
set fuelled_on = (created_at at time zone 'Pacific/Auckland')::date
where fuelled_on is null;

alter table public.fuel_entries alter column fuelled_on set default (now() at time zone 'Pacific/Auckland')::date;
alter table public.fuel_entries alter column fuelled_on set not null;

-- Odometer photo is now optional (the receipt carries the mileage) - a
-- vehicle fill-up still needs the odometer reading itself.
alter table public.fuel_entries drop constraint if exists fuel_entries_vehicle_or_equipment;
alter table public.fuel_entries add constraint fuel_entries_vehicle_or_equipment check (
  (vehicle_id is not null and equipment is null and odometer_km is not null)
  or (vehicle_id is null and equipment = 'waterblaster')
);

-- ── Admin manual entries ────────────────────────────────────────────────
-- Admins can add a fill-up on a driver's behalf from Fleet → Fuel Log
-- (e.g. a receipt handed in at the office), so the receipt photo becomes
-- optional too, and admins may insert rows for any driver - the existing
-- fleet_fuel_insert_own policy only lets drivers insert their own.
alter table public.fuel_entries alter column receipt_photo_path drop not null;

drop policy if exists "fleet_fuel_admin_insert" on public.fuel_entries;
create policy "fleet_fuel_admin_insert" on public.fuel_entries
  for insert with check (public.current_profile_role() = 'admin');

-- Waterblaster fuel → job actual cost: date the cost line by the fill-up,
-- not by when it was logged. Otherwise identical to the version in
-- fleet_waterblaster_fuel.sql.
create or replace function public.fuel_entry_to_job_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.equipment = 'waterblaster' and new.job_id is not null then
    insert into public.job_actual_costs (job_id, category_id, description, amount, source, incurred_at, fuel_entry_id)
    values (
      new.job_id,
      (select id from public.job_categories where key = 'fuel'),
      'Waterblaster fuel — ' || new.litres || ' L ($' || to_char(new.cost_total, 'FM999999990.00') || ' incl GST)',
      round(new.cost_total / 1.15, 2),
      'fleet_fuel',
      coalesce(new.fuelled_on, (new.created_at at time zone 'Pacific/Auckland')::date),
      new.id
    );
  end if;
  return new;
end;
$$;
