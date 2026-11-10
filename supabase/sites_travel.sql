-- Platinum Painters Hub — a "Travel" clock-in site for supervisors.
-- Supervisors switch to Travel (one tap, the Travel button next to Switch
-- site) when they leave a site, so driving time isn't charged to the job
-- they've just left. Not a job; painters don't see it. After sites_office.sql.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.sites add column if not exists is_travel boolean not null default false;

insert into public.sites (name, is_active, is_travel)
select 'Travel', true, true
where not exists (select 1 from public.sites where is_travel);

-- Check: should show the Travel site.
select id, name, is_active, is_travel from public.sites where is_travel;
