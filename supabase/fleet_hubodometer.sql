-- Platinum Painters Hub — hubodometers for diesel tax (RUC).
-- Run once in the Supabase SQL Editor, after fleet_fuel_optional_numbers.sql.
-- Safe to re-run.
--
-- Some diesels (the Toyota Dynas) have their Road User Charges measured by
-- a hubodometer on the wheel hub, not the dashboard odometer, so the RUC
-- licence's "paid to" km is a hubo number. Those vehicles are set to
-- "Hubodometer" on Fleet → Vehicles; every fill-up then records both
-- readings. The odometer still drives servicing and fuel economy; the hubo
-- drives RUC. The Hub links the two (lib/fleet/hubodometer.ts): it works
-- out how many hubo km each odometer km is from fill-ups that have both,
-- uses that to estimate the hubo when a fill-up is missing one, and warns
-- when a reading looks out of line.

alter table public.vehicles
  add column if not exists ruc_meter text not null default 'odometer';
alter table public.vehicles drop constraint if exists vehicles_ruc_meter_check;
alter table public.vehicles add constraint vehicles_ruc_meter_check
  check (ruc_meter in ('odometer', 'hubodometer'));

-- The hubo reading when the vehicle is set up (or last checked by the
-- office), used until fill-ups carry their own readings.
alter table public.vehicles
  add column if not exists current_hubodometer_km numeric;

-- The hubo reading at the pump. Only for hubodometer vehicles; can be left
-- blank (admins are flagged to fill it in, like the other numbers).
alter table public.fuel_entries
  add column if not exists hubodometer_km numeric;
alter table public.fuel_entries drop constraint if exists fuel_entries_hubodometer_positive;
alter table public.fuel_entries add constraint fuel_entries_hubodometer_positive
  check (hubodometer_km is null or hubodometer_km > 0);
