-- Platinum Painters Hub — each person's notification choices (the
-- Notifications page). Run once in the Supabase SQL Editor. Safe to re-run.
--
-- One row per person per notification they've changed from the default;
-- the defaults (and what each notification is) live in
-- src/lib/notifications/catalog.ts. scope is the option picked, e.g.
-- 'mine' / 'all' (whose quotes) or 'first' / 'each' (which views).

create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  enabled boolean not null,
  scope text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.notification_preferences enable row level security;

-- Everyone manages their own; the senders read them with the service role.
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
