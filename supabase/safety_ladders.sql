-- Platinum Painters Hub — Health & safety → Ladders: the ladder register.
-- Each ladder (asset number, type, material, length, rating, where it's
-- kept) and its inspections - pass/fail on stiles, rungs, feet, locks and
-- spreaders, and labels - with who checked it and when. A failed
-- inspection tags the ladder out of service until a manager puts it back.
-- Run once in the Supabase SQL Editor, after page_access_and_safety.sql.
-- Safe to re-run.
--
-- Anyone with Health & safety ticked sees the register and can record an
-- inspection (a pre-use check on site). Managers (safety_manager()) add,
-- change and retire ladders, and can change or delete inspections.

create table if not exists public.ladders (
  id uuid primary key default gen_random_uuid(),
  -- The number on the ladder's tag, e.g. "L01".
  asset_no text not null,
  ladder_type text not null default 'step'
    check (ladder_type in ('step', 'extension', 'single', 'platform', 'trestle', 'combination')),
  material text not null default 'aluminium' check (material in ('aluminium', 'fibreglass', 'timber')),
  length_m numeric(4, 1) check (length_m is null or length_m > 0),
  -- Load rating; industrial is 120 kg or more.
  rating_kg integer check (rating_kg is null or rating_kg > 0),
  standard text default 'AS/NZS 1892',
  brand text,
  -- Where it's kept: a vehicle, the yard, a site.
  location text,
  in_service_on date,
  -- How often it's inspected (days).
  inspect_every_days integer not null default 30 check (inspect_every_days > 0),
  status text not null default 'in_service' check (status in ('in_service', 'tagged_out', 'retired')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ladders_asset_no_key on public.ladders (lower(asset_no));

alter table public.ladders enable row level security;
drop policy if exists ladders_select on public.ladders;
create policy ladders_select on public.ladders for select using (public.hub_page_ok('safety'));
drop policy if exists ladders_write on public.ladders;
create policy ladders_write on public.ladders
  for all using (public.safety_manager()) with check (public.safety_manager());

create table if not exists public.ladder_inspections (
  id uuid primary key default gen_random_uuid(),
  ladder_id uuid not null references public.ladders(id) on delete cascade,
  inspected_on date not null,
  inspected_by uuid references public.profiles(id) on delete set null default auth.uid(),
  result text not null check (result in ('pass', 'fail')),
  -- Each check: {"stiles": "pass", "rungs": "fail", ...}
  checks jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists ladder_inspections_ladder_idx on public.ladder_inspections (ladder_id, inspected_on desc);

alter table public.ladder_inspections enable row level security;
drop policy if exists ladder_inspections_select on public.ladder_inspections;
create policy ladder_inspections_select on public.ladder_inspections for select using (public.hub_page_ok('safety'));
drop policy if exists ladder_inspections_insert on public.ladder_inspections;
create policy ladder_inspections_insert on public.ladder_inspections
  for insert with check (public.safety_manager() or (public.hub_page_ok('safety') and inspected_by = auth.uid()));
drop policy if exists ladder_inspections_update on public.ladder_inspections;
create policy ladder_inspections_update on public.ladder_inspections
  for update using (public.safety_manager()) with check (public.safety_manager());
drop policy if exists ladder_inspections_delete on public.ladder_inspections;
create policy ladder_inspections_delete on public.ladder_inspections
  for delete using (public.safety_manager());

-- A failed inspection tags the ladder out, whoever records it (painters
-- can't edit ladders directly, so this runs as the table owner).
create or replace function public.ladder_tag_out_on_fail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.result = 'fail' then
    update public.ladders set status = 'tagged_out', updated_at = now()
    where id = new.ladder_id and status = 'in_service';
  end if;
  return new;
end;
$$;
drop trigger if exists ladder_inspections_tag_out on public.ladder_inspections;
create trigger ladder_inspections_tag_out
  after insert on public.ladder_inspections
  for each row execute function public.ladder_tag_out_on_fail();

-- Check: should show both tables = 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'ladders') as ladders_table,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'ladder_inspections') as inspections_table;
