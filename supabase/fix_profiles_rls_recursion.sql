-- URGENT FIX: infinite recursion in RLS policies on public.profiles.
--
-- sales_schema.sql added "profiles_sales_authority_select", a second
-- self-referencing subquery policy on public.profiles (on top of the
-- pre-existing "fleet_hub_profiles_admin_select_all"). Combined, Postgres's
-- RLS planner can no longer resolve row visibility and throws
-- "infinite recursion detected in policy for relation \"profiles\""
-- on EVERY read of profiles, for every user (breaks sign-in and routing in
-- both the Hub and Timesheets, which share this database).
--
-- Fix: read the caller's own role via a SECURITY DEFINER function, which
-- bypasses RLS internally instead of re-triggering policy evaluation on
-- profiles. This is the standard pattern for "is my own row an admin"
-- checks that avoids self-referencing RLS recursion entirely.

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

-- ── profiles ────────────────────────────────────────────────────────────

drop policy if exists "fleet_hub_profiles_admin_select_all" on public.profiles;
create policy "fleet_hub_profiles_admin_select_all" on public.profiles
  for select using (
    public.current_profile_role() in ('admin', 'supervisor')
  );

drop policy if exists "profiles_sales_authority_select" on public.profiles;
create policy "profiles_sales_authority_select" on public.profiles
  for select using (
    profiles.role = 'sales'
    and public.current_profile_role() = 'sales'
    and public.current_user_is_sales_authority()
  );

-- ── jobs ────────────────────────────────────────────────────────────────
-- Same self-referencing-subquery pattern (queries profiles/user_app_access
-- inside a jobs policy) - not the direct cause of the profiles recursion,
-- but rewritten for consistency and to remove any further recursion risk.

drop policy if exists "jobs_sales_select" on public.jobs;
create policy "jobs_sales_select" on public.jobs
  for select using (
    public.current_profile_role() = 'sales'
    and (public.current_user_is_sales_authority() or jobs.lead_by_user_id = auth.uid())
  );

-- ── sales_targets ───────────────────────────────────────────────────────

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
