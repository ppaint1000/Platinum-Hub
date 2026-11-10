-- Platinum Painters Hub — an "Office" clock-in site for supervisors.
-- Supervisors (and admins) sometimes start the day at the office before
-- going out to jobs, so the clock screen lists the office site for them,
-- first, even though it isn't a job. Painters don't see it.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.sites add column if not exists is_office boolean not null default false;

insert into public.sites (name, is_active, is_office)
select 'Office', true, true
where not exists (select 1 from public.sites where is_office);

-- Check: should show the Office site.
select id, name, is_active, is_office from public.sites where is_office;
