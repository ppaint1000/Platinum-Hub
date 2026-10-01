-- Platinum Painters Hub — each client's salesperson (whose client it is).
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Set when the client is new: by the admin adding it in the Hub, or to the
-- salesperson who created the customer in the Costing app (see
-- /api/integrations/quotes/customers). After that only an admin can change it.

alter table public.clients
  add column if not exists sales_person_id uuid references public.profiles(id) on delete set null;

-- Existing clients: whoever led their most recent job.
update public.clients c
set sales_person_id = j.lead_by_user_id
from (
  select distinct on (client_id) client_id, lead_by_user_id
  from public.jobs
  where client_id is not null and lead_by_user_id is not null
  order by client_id, created_at desc
) j
where j.client_id = c.id and c.sales_person_id is null;

-- Only an admin can change it once set. The integrations (service role, no
-- signed-in user) only ever set it on a new client.
create or replace function public.clients_guard_sales_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sales_person_id is distinct from old.sales_person_id
     and auth.uid() is not null
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Only an admin can change a client''s salesperson.';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_guard_sales_person on public.clients;
create trigger clients_guard_sales_person
  before update of sales_person_id on public.clients
  for each row execute function public.clients_guard_sales_person();
