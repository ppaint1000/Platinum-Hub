-- Platinum Painters Hub — fuel entries can be saved without the numbers
-- Run once in the Supabase SQL Editor, after fleet_fuel_date.sql.
-- Safe to re-run.
--
-- If a receipt can't be read, a driver can now save the entry with the
-- odometer / litres / cost left blank - admins get an email and a "Missing
-- numbers" flag (Fleet → Fuel Log and the dashboard) and fill them in from
-- the receipt photo via Edit.

alter table public.fuel_entries alter column litres drop not null;
alter table public.fuel_entries alter column cost_total drop not null;

-- A vehicle entry no longer has to carry an odometer reading either.
alter table public.fuel_entries drop constraint if exists fuel_entries_vehicle_or_equipment;
alter table public.fuel_entries add constraint fuel_entries_vehicle_or_equipment check (
  (vehicle_id is not null and equipment is null)
  or (vehicle_id is null and equipment = 'waterblaster')
);

-- ── Waterblaster fuel → job actual cost, kept in step on edit ───────────
-- Previously insert-only. Now also runs on update, because a waterblaster
-- entry saved without a cost only reaches the job once an admin fills the
-- cost in - and an admin correcting the job, date or amount should move
-- the cost line with it. Anything that stops being a costed waterblaster
-- entry (cost cleared, switched to a vehicle) has its cost line removed.
create or replace function public.fuel_entry_to_job_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_description text;
  line_date date;
begin
  if new.equipment = 'waterblaster' and new.job_id is not null and new.cost_total is not null then
    line_description := 'Waterblaster fuel — '
      || coalesce(new.litres::text || ' L ', '')
      || '($' || to_char(new.cost_total, 'FM999999990.00') || ' incl GST)';
    line_date := coalesce(new.fuelled_on, (new.created_at at time zone 'Pacific/Auckland')::date);

    update public.job_actual_costs
    set job_id = new.job_id,
        description = line_description,
        amount = round(new.cost_total / 1.15, 2),
        incurred_at = line_date
    where fuel_entry_id = new.id;

    if not found then
      insert into public.job_actual_costs (job_id, category_id, description, amount, source, incurred_at, fuel_entry_id)
      values (
        new.job_id,
        (select id from public.job_categories where key = 'fuel'),
        line_description,
        round(new.cost_total / 1.15, 2),
        'fleet_fuel',
        line_date,
        new.id
      );
    end if;
  else
    delete from public.job_actual_costs where fuel_entry_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists fuel_entries_job_cost on public.fuel_entries;
create trigger fuel_entries_job_cost
  after insert or update on public.fuel_entries
  for each row
  execute function public.fuel_entry_to_job_cost();
