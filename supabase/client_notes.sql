-- Platinum Painters Hub — notes on a client, shown on the client's Timeline
-- alongside its quotes, proposals, wins and losses.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Admin-only, like clients themselves (see jobs_schema.sql).

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_notes_client_id_idx on public.client_notes (client_id, created_at desc);

alter table public.client_notes enable row level security;

drop policy if exists client_notes_admin_select on public.client_notes;
create policy client_notes_admin_select on public.client_notes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists client_notes_admin_insert on public.client_notes;
create policy client_notes_admin_insert on public.client_notes for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists client_notes_admin_delete on public.client_notes;
create policy client_notes_admin_delete on public.client_notes for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
