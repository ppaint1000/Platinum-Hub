-- Platinum Painters Hub — a client's own email, phone and address, and when
-- it was last updated (the Clients table columns).
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Filled from the Costing app's customers (/api/integrations/quotes/customers)
-- and editable on the client's page.

alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists updated_at timestamptz;

update public.clients set updated_at = created_at where updated_at is null;
alter table public.clients alter column updated_at set default now();
alter table public.clients alter column updated_at set not null;

create or replace function public.clients_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists clients_touch_updated_at on public.clients;
create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function public.clients_touch_updated_at();
