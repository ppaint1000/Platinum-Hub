-- Platinum Painters Hub — each vehicle's next service.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Vehicles are serviced every 10,000 km. Once a service is logged under
-- Fleet → Servicing, the next one counts on from that (odometer + 10,000,
-- or the record's own "Next due (km)"). Until then - and for vehicles
-- serviced elsewhere - this is when the next one is due, set on the vehicle.

alter table public.vehicles add column if not exists next_service_km integer;
alter table public.vehicles add column if not exists next_service_date date;

-- Carried over from the vehicles' notes, where they were being kept.
update public.vehicles set next_service_km = 272700, next_service_date = '2027-05-19'
where plate = 'JBB266' and next_service_km is null;
update public.vehicles set next_service_km = 156000, next_service_date = '2027-09-21'
where plate = 'PPM330' and next_service_km is null;
