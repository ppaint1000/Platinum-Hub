-- Platinum Painters Hub — job variations and customer claims (invoices).
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Variations: extra (or less) work agreed with the customer. Approved ones
-- add their price to the job's contract value, and any cost budget (and
-- hours) onto the job's budget.
-- Claims: what has been invoiced to the customer so far - drives "claimed
-- to date", "left to claim" and the cash forecast.
-- Admin-only, the same as every other Jobs table.

create table if not exists public.job_variations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reference text,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  amount numeric(12,2) not null default 0,
  budget_category_id uuid references public.job_categories(id) on delete set null,
  budget_amount numeric(12,2) not null default 0,
  hours numeric(10,2) not null default 0,
  notes text,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists job_variations_job_idx on public.job_variations (job_id);

create table if not exists public.job_claims (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  claim_date date not null default current_date,
  reference text,
  amount numeric(12,2) not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists job_claims_job_idx on public.job_claims (job_id);
create index if not exists job_claims_date_idx on public.job_claims (claim_date);

alter table public.job_variations enable row level security;
alter table public.job_claims enable row level security;

drop policy if exists job_variations_admin_all on public.job_variations;
create policy job_variations_admin_all on public.job_variations
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists job_claims_admin_all on public.job_claims;
create policy job_claims_admin_all on public.job_claims
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
