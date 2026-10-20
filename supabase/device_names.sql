-- Names admins give devices in Users -> Sign-in log ("Saimone's work
-- phone"), keyed by the Hub's own device id (the hub_device cookie,
-- hub_sign_ins.device_id). Used in the sign-in log and new-device emails.
-- Safe to re-run.
create table if not exists public.hub_device_names (
  device_id text primary key,
  name text not null,
  named_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- Service role only (the Hub reads and writes it server-side for admins).
alter table public.hub_device_names enable row level security;
