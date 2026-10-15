-- Platinum Painters Hub — each vehicle's fuel (petrol or diesel), and for a
-- diesel its Road User Charges (diesel tax): the odometer km its current RUC
-- licence runs out at. Run once in the Supabase SQL Editor. Safe to re-run.
alter table public.vehicles add column if not exists fuel_type text not null default 'petrol';
alter table public.vehicles drop constraint if exists vehicles_fuel_type_check;
alter table public.vehicles add constraint vehicles_fuel_type_check check (fuel_type in ('petrol', 'diesel'));
alter table public.vehicles add column if not exists ruc_paid_to_km integer;

select plate, fuel_type, ruc_paid_to_km from public.vehicles order by plate;
