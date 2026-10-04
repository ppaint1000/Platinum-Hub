-- Platinum Painters Hub — repaint and maintenance reminders (like Tradify's
-- service reminders). When a job is completed the Hub adds a check-up
-- reminder (e.g. 12 months on) and a repaint reminder (e.g. 7 years on);
-- reminders can also be added by hand. When one is due the customer is
-- emailed (if ticked) and the office is told. Admins only.
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.client_reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  kind text not null default 'other' check (kind in ('maintenance', 'repaint', 'other')),
  due_on date not null,
  note text,
  email_customer boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'sent', 'done', 'cancelled')),
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists client_reminders_due_idx on public.client_reminders (status, due_on);
create index if not exists client_reminders_client_idx on public.client_reminders (client_id);
-- One automatic check-up and one repaint reminder per job.
create unique index if not exists client_reminders_job_kind_idx on public.client_reminders (job_id, kind)
  where job_id is not null and kind in ('maintenance', 'repaint');

alter table public.client_reminders enable row level security;
drop policy if exists client_reminders_admin_all on public.client_reminders;
create policy client_reminders_admin_all on public.client_reminders
  for all using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- When the automatic reminders fall (0 = don't add that one).
create table if not exists public.reminder_settings (
  id boolean primary key default true check (id),
  maintenance_months integer not null default 12,
  repaint_years integer not null default 7,
  updated_at timestamptz not null default now()
);
insert into public.reminder_settings (id) values (true) on conflict (id) do nothing;

alter table public.reminder_settings enable row level security;
drop policy if exists reminder_settings_admin_all on public.reminder_settings;
create policy reminder_settings_admin_all on public.reminder_settings
  for all using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

-- Check: should show reminders_table = 1, settings_rows = 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'client_reminders') as reminders_table,
  (select count(*) from public.reminder_settings) as settings_rows;
