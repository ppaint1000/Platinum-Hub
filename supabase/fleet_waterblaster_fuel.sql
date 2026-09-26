-- Platinum Painters Hub — log waterblaster fuel against a job
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- The driver fuel form (/fleet/log) gets a "Waterblaster" option alongside
-- the vehicles. A waterblaster fill-up has no vehicle and no odometer, but
-- must name the job it was for — and its cost lands on that job's actual
-- costs automatically, via the trigger below rather than the form itself,
-- since drivers have no RLS access to jobs/job_actual_costs.

-- ── fuel_entries: vehicle OR equipment ─────────────────────────────────
alter table public.fuel_entries alter column vehicle_id drop not null;
alter table public.fuel_entries alter column odometer_km drop not null;
alter table public.fuel_entries alter column odometer_photo_path drop not null;
alter table public.fuel_entries add column if not exists equipment text;
alter table public.fuel_entries add column if not exists job_id uuid references public.jobs(id) on delete set null;

-- Either a normal vehicle fill-up (vehicle + odometer, no equipment) or a
-- waterblaster fill-up (no vehicle, job required). job_id is only "not
-- null" at insert time for waterblaster rows — it's on delete set null, so
-- deleting the job later mustn't be blocked by this check.
alter table public.fuel_entries drop constraint if exists fuel_entries_vehicle_or_equipment;
alter table public.fuel_entries add constraint fuel_entries_vehicle_or_equipment check (
  (vehicle_id is not null and equipment is null and odometer_km is not null and odometer_photo_path is not null)
  or (vehicle_id is null and equipment = 'waterblaster')
);

-- ── job_actual_costs: link back to the fuel entry that created it ───────
-- Cascade so deleting a fuel entry (admin-only) also removes the cost it
-- put on the job, rather than leaving an orphaned line behind.
alter table public.job_actual_costs
  add column if not exists fuel_entry_id uuid references public.fuel_entries(id) on delete cascade;
create unique index if not exists job_actual_costs_fuel_entry_id_idx
  on public.job_actual_costs(fuel_entry_id) where fuel_entry_id is not null;

insert into public.job_categories (key, label, sort_order)
select 'fuel', 'Fuel', coalesce(max(sort_order), -1) + 1 from public.job_categories
where not exists (select 1 from public.job_categories where key = 'fuel');

-- ── Trigger: waterblaster fuel → job actual cost ───────────────────────
-- Amount is GST-exclusive (receipt total / 1.15), matching the other job
-- cost lines (supplier invoice lines are costed at their ex-GST subtotal);
-- the GST-inclusive receipt total is kept in the description.
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
      (new.created_at at time zone 'Pacific/Auckland')::date,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists fuel_entries_job_cost on public.fuel_entries;
create trigger fuel_entries_job_cost
  after insert on public.fuel_entries
  for each row
  execute function public.fuel_entry_to_job_cost();
