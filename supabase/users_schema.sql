-- Platinum Painters Hub — Users module schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: table creation is guarded and policies are dropped/recreated,
-- same convention as schema.sql / jobs_schema.sql.
--
-- Adds per-app access control + a "default app" (where a user lands right
-- after signing in) on top of the existing coarse `profiles.role` gate, and
-- a `deleted_at` marker on `profiles` so a hard-deleted Auth user whose
-- profile can't be removed (fleet history references it via `on delete
-- restrict`) can still be hidden from the Users list.

-- ── profiles: extend the shared table (owned by the Timesheets app schema,
--    not created here — same pattern jobs_schema.sql already used on
--    public.orders) ──────────────────────────────────────────────────────

alter table public.profiles add column if not exists deleted_at timestamptz;

-- ── user_app_access ────────────────────────────────────────────────────

create table if not exists public.user_app_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  timesheets boolean not null default true,
  fleet boolean not null default false,
  orders boolean not null default false,
  jobs boolean not null default false,
  default_app text not null default 'timesheets'
    check (default_app in ('hub', 'timesheets', 'fleet', 'orders', 'jobs')),
  updated_at timestamptz not null default now()
);

-- Backfill so nobody loses access on deploy day: existing admins/supervisors
-- keep full Hub access and land on the Hub; existing painters keep
-- Timesheets-only access and keep landing on Timesheets.
insert into public.user_app_access (user_id, timesheets, fleet, orders, jobs, default_app)
select
  id,
  true,
  role in ('admin', 'supervisor'),
  role in ('admin', 'supervisor'),
  role = 'admin',
  case when role in ('admin', 'supervisor') then 'hub' else 'timesheets' end
from public.profiles
on conflict (user_id) do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────────
-- A user must be able to read their own row (proxy.ts runs as the signed-in
-- user via the anon key/cookies, not a service role) — same non-recursive
-- shape as schema.sql's fleet_hub_profiles_self_select /
-- fleet_hub_profiles_admin_select_all policies. Writes are admin-only.

alter table public.user_app_access enable row level security;

drop policy if exists "user_app_access_self_select" on public.user_app_access;
create policy "user_app_access_self_select" on public.user_app_access
  for select using (auth.uid() = user_id);

drop policy if exists "user_app_access_admin_select" on public.user_app_access;
create policy "user_app_access_admin_select" on public.user_app_access
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "user_app_access_admin_insert" on public.user_app_access;
create policy "user_app_access_admin_insert" on public.user_app_access
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "user_app_access_admin_update" on public.user_app_access;
create policy "user_app_access_admin_update" on public.user_app_access
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "user_app_access_admin_delete" on public.user_app_access;
create policy "user_app_access_admin_delete" on public.user_app_access
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
