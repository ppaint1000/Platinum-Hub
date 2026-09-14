-- Platinum Hub — Sales role and Sales tab
-- Run this once in the Supabase SQL Editor. Safe to re-run: guarded like
-- the rest of the Jobs-module schema files.
--
-- A "sales" role sees only their own quoted/won $ against a monthly
-- budget, unless their "authority" flag is set (then they see everyone's).
-- Budgets are always admin-edited, never by sales people themselves.

-- profiles.role has a check constraint (from the Timesheets schema,
-- migration_04_roles_and_settings.sql) currently limited to
-- admin/supervisor/painter — widen it to include the new role.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'supervisor', 'painter', 'sales'));

alter table public.user_app_access add column if not exists sales boolean not null default false;
alter table public.user_app_access add column if not exists sales_authority boolean not null default false;

alter table public.jobs add column if not exists lead_by_user_id uuid references public.profiles(id);

create table if not exists public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  -- Quoted and won each get their own target - the business quotes a
  -- volume of work and separately targets how much of it actually closes,
  -- so one shared number doesn't track either well.
  budget_quoted numeric(12,2) not null default 0,
  budget_won numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, year, month)
);

-- ── RLS ─────────────────────────────────────────────────────────────────
--
-- IMPORTANT: policies below read the caller's own role/access via these
-- SECURITY DEFINER helpers rather than a correlated subquery on profiles
-- directly. profiles already has one self-referencing policy
-- (fleet_hub_profiles_admin_select_all, in schema.sql) — a second
-- self-referencing subquery policy here caused Postgres's RLS planner to
-- hit genuine "infinite recursion detected in policy for relation
-- profiles" on every read of profiles, breaking sign-in/routing across
-- both the Hub and Timesheets (they share this database). These functions
-- bypass RLS internally instead of re-triggering policy evaluation, so
-- they can't recurse.

create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_is_sales_authority()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(a.sales_authority, false)
  from public.user_app_access a
  where a.user_id = auth.uid();
$$;

-- Additive: alongside the existing admin-only select policy on jobs
-- (jobs_admin_select_jobs, from jobs_schema.sql) — Postgres OR's multiple
-- select policies together, so this only ever adds visibility, never
-- takes any away.
drop policy if exists "jobs_sales_select" on public.jobs;
create policy "jobs_sales_select" on public.jobs
  for select using (
    public.current_profile_role() = 'sales'
    and (public.current_user_is_sales_authority() or jobs.lead_by_user_id = auth.uid())
  );

-- Additive on profiles too — a sales_authority user needs the *names* of
-- other salespeople to render the "everyone" view, not just their job
-- rows. Scoped to role='sales' profiles only, not every profile.
drop policy if exists "profiles_sales_authority_select" on public.profiles;
create policy "profiles_sales_authority_select" on public.profiles
  for select using (
    profiles.role = 'sales'
    and public.current_profile_role() = 'sales'
    and public.current_user_is_sales_authority()
  );

alter table public.sales_targets enable row level security;

drop policy if exists "sales_targets_select" on public.sales_targets;
create policy "sales_targets_select" on public.sales_targets
  for select using (
    public.current_profile_role() = 'admin'
    or sales_targets.user_id = auth.uid()
    or (public.current_profile_role() = 'sales' and public.current_user_is_sales_authority())
  );

drop policy if exists "sales_targets_admin_write" on public.sales_targets;
create policy "sales_targets_admin_write" on public.sales_targets
  for all using (
    public.current_profile_role() = 'admin'
  ) with check (
    public.current_profile_role() = 'admin'
  );
