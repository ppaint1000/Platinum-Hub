-- Sign-in log: one row per sign-in (Supabase auth session), with the
-- device it came from, the rough place (from the IP), and - for sales and
-- supervisor staff - a GPS stamp from the sign-in page. Also drives "one
-- device at a time" (profiles.allow_multiple_devices = false) and the
-- new-device email (see src/lib/supabase/proxy.ts and lib/security/).

alter table public.profiles
  add column if not exists allow_multiple_devices boolean not null default false;

create table if not exists public.hub_sign_ins (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text,
  user_agent text,
  ip text,
  city text,
  country text,
  new_device boolean not null default false,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  -- 'shared', 'denied', 'unavailable' - null when it wasn't asked for.
  location_status text,
  located_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hub_sign_ins_user_idx on public.hub_sign_ins (user_id, created_at desc);
create index if not exists hub_sign_ins_created_idx on public.hub_sign_ins (created_at desc);

alter table public.hub_sign_ins enable row level security;

drop policy if exists "admins read sign-ins" on public.hub_sign_ins;
create policy "admins read sign-ins" on public.hub_sign_ins
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Called from the Hub's request gate the first time it sees a session.
-- Records it (or fills in the device details if the GPS stamp got there
-- first) and says whether the device is new to this person, whether this
-- is the first sign-in ever recorded for them (no email then - the log
-- starts empty), and whether they may stay signed in on other devices.
create or replace function public.hub_record_sign_in(
  p_device text, p_user_agent text, p_ip text, p_city text, p_country text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_seen boolean;
  v_any boolean;
  v_multi boolean;
  v_existing boolean;
begin
  if v_user is null or v_session is null then
    return json_build_object('ok', false);
  end if;

  select exists (select 1 from hub_sign_ins where user_id = v_user and session_id <> v_session and device_id is not null) into v_any;
  select exists (select 1 from hub_sign_ins where user_id = v_user and session_id <> v_session and device_id = p_device) into v_seen;
  select exists (select 1 from hub_sign_ins where session_id = v_session and device_id is not null) into v_existing;
  select coalesce(allow_multiple_devices, false) into v_multi from profiles where id = v_user;

  insert into hub_sign_ins (session_id, user_id, device_id, user_agent, ip, city, country, new_device)
  values (v_session, v_user, p_device, p_user_agent, p_ip, p_city, p_country, v_any and not v_seen)
  on conflict (session_id) do update set
    device_id = coalesce(hub_sign_ins.device_id, excluded.device_id),
    user_agent = coalesce(hub_sign_ins.user_agent, excluded.user_agent),
    ip = coalesce(hub_sign_ins.ip, excluded.ip),
    city = coalesce(hub_sign_ins.city, excluded.city),
    country = coalesce(hub_sign_ins.country, excluded.country),
    new_device = case when hub_sign_ins.device_id is null then excluded.new_device else hub_sign_ins.new_device end;

  return json_build_object(
    'ok', true,
    'session_id', v_session,
    'already_recorded', v_existing,
    'new_device', v_any and not v_seen and not v_existing,
    'multi_device', coalesce(v_multi, false)
  );
end;
$$;

-- The sign-in page's GPS stamp (sales and supervisors), for this session.
create or replace function public.hub_set_sign_in_location(
  p_status text, p_lat double precision, p_lng double precision, p_accuracy double precision
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_user is null or v_session is null then
    return;
  end if;
  insert into hub_sign_ins (session_id, user_id, latitude, longitude, accuracy_m, location_status, located_at)
  values (v_session, v_user, p_lat, p_lng, p_accuracy, p_status, now())
  on conflict (session_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    location_status = excluded.location_status,
    located_at = excluded.located_at
  where hub_sign_ins.user_id = v_user;
end;
$$;

revoke all on function public.hub_record_sign_in(text, text, text, text, text) from public, anon;
revoke all on function public.hub_set_sign_in_location(text, double precision, double precision, double precision) from public, anon;
grant execute on function public.hub_record_sign_in(text, text, text, text, text) to authenticated;
grant execute on function public.hub_set_sign_in_location(text, double precision, double precision, double precision) to authenticated;
