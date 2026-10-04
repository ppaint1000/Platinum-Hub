-- Platinum Painters Hub — one customer list. Clock-in sites now belong to a
-- Hub client (sites.client_id) instead of a Timesheets customer. Run once
-- in the Supabase SQL Editor. Safe to re-run.
--
-- Nothing is deleted: the old customers table stays as it was, with each
-- row noting the client it became (customers.client_id).

alter table public.sites add column if not exists client_id uuid references public.clients(id) on delete restrict;
alter table public.customers add column if not exists client_id uuid references public.clients(id) on delete set null;

-- Timesheets customers with no client of the same name become clients.
insert into public.clients (name, notes)
select c.name, case when c.contact_person is not null then 'Contact: ' || c.contact_person end
from public.customers c
where not exists (select 1 from public.clients k where lower(trim(k.name)) = lower(trim(c.name)));

update public.customers c
set client_id = (
  select k.id from public.clients k where lower(trim(k.name)) = lower(trim(c.name)) order by k.created_at limit 1
)
where c.client_id is null;

-- Each site's client: its job's client, else its old customer's client.
update public.sites s
set client_id = coalesce(
  (select j.client_id from public.jobs j where j.id = s.job_id),
  (select c.client_id from public.customers c where c.id = s.customer_id)
)
where s.client_id is null;

-- New sites only need a client.
alter table public.sites alter column customer_id drop not null;

-- The clock-in screen shows the site's client name, so signed-in staff can
-- read the clients that have an active site.
drop policy if exists clients_site_select on public.clients;
create policy clients_site_select on public.clients
  for select to authenticated
  using (exists (select 1 from public.sites s where s.client_id = clients.id and s.is_active));

select
  (select count(*) from public.sites) as sites,
  (select count(*) from public.sites where client_id is not null) as sites_with_client,
  (select count(*) from public.customers where client_id is not null) as customers_matched;
