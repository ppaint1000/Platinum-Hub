-- Platinum Painters Hub — proposal follow-up reminders, and Requests (new
-- enquiries, like Jobber's). Run once in the Supabase SQL Editor. Safe to
-- re-run.

-- ── Proposal follow-ups ─────────────────────────────────────────────────
-- When each reminder went out, so each one is only sent once.
alter table public.proposals add column if not exists reminded_unopened_at timestamptz;
alter table public.proposals add column if not exists reminded_followup_at timestamptz;

-- ── Requests ────────────────────────────────────────────────────────────
-- A new enquiry - from the website's quote form, or typed in after a phone
-- call or email - until it becomes a site measure (or goes nowhere).
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  company text,
  email text,
  phone text,
  address text,
  message text,
  source text not null default 'phone' check (source in ('website', 'phone', 'email', 'referral', 'other')),
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'declined')),
  -- Whose it is (null = not given to anyone yet).
  owner_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  site_measure_id uuid references public.site_measures(id) on delete set null,
  notes text
);
create index if not exists requests_status_idx on public.requests(status, created_at desc);

alter table public.requests enable row level security;

-- Admins see every request. Measures / Costing users see the ones given to
-- them and the ones not given to anyone yet (so they can pick them up).
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select using (
    public.mc_is_admin()
    or ((public.mc_can('measures') or public.mc_can('costing')) and (owner_id = auth.uid() or owner_id is null))
  );
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests
  for insert with check (public.mc_is_admin() or public.mc_can('measures') or public.mc_can('costing'));
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests
  for update using (
    public.mc_is_admin()
    or ((public.mc_can('measures') or public.mc_can('costing')) and (owner_id = auth.uid() or owner_id is null))
  )
  with check (
    public.mc_is_admin()
    or ((public.mc_can('measures') or public.mc_can('costing')) and (owner_id = auth.uid() or owner_id is null))
  );
drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests for delete using (public.mc_is_admin());

select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proposals' and column_name like 'reminded_%') as reminder_columns,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'requests') as requests_table;
