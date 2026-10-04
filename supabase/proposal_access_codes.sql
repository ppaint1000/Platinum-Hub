-- Platinum Painters Hub — customer proposal links need a 6-digit code.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Each proposal gets its own code. The customer types it once to open the
-- proposal (crawlers and anyone with just the link can't get in); staff who
-- can see the costing open it without one. Work order links (/w/...) now
-- need a Hub sign-in (crew are signed in on the clock-in page).

alter table public.proposals add column if not exists access_code text;
update public.proposals
set access_code = lpad((floor(random() * 1000000))::int::text, 6, '0')
where access_code is null;
alter table public.proposals alter column access_code set default lpad((floor(random() * 1000000))::int::text, 6, '0');
alter table public.proposals alter column access_code set not null;

-- The code must match, unless it's staff who can see the costing.
create or replace function public.proposal_code_ok(p_token text, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.proposals p
    where p.token = p_token and length(p_token) >= 32
      and (p.access_code = trim(coalesce(p_code, '')) or public.mc_quote_visible(p.quote_id))
  );
$$;

-- The old one-argument versions let anyone with the link in; replaced.
drop function if exists public.proposal_by_token(text);
drop function if exists public.proposal_record_view(text, uuid, integer, text);
drop function if exists public.proposal_accept(text, text, text, jsonb, numeric, text);

create or replace function public.proposal_by_token(p_token text, p_code text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'proposal', to_jsonb(p) - 'accepted_user_agent' - 'access_code',
    'quote', jsonb_build_object('location', q.location, 'project', q.project, 'valid_until', q.valid_until, 'status', q.status, 'owner_id', q.owner_id),
    'customer', jsonb_build_object('name', c.name),
    'settings', to_jsonb(s)
  )
  from public.proposals p
  join public.quotes q on q.id = p.quote_id
  left join public.clients c on c.id = q.customer_id
  left join public.proposal_settings s on true
  where p.token = p_token and public.proposal_code_ok(p_token, p_code);
$$;

create or replace function public.proposal_record_view(p_token text, p_view_id uuid, p_seconds integer, p_user_agent text, p_code text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  was_first boolean;
  is_new_view boolean;
begin
  if not public.proposal_code_ok(p_token, p_code) then
    return false;
  end if;
  select id, first_viewed_at is null into pid, was_first from public.proposals where token = p_token;
  if pid is null then
    return false;
  end if;

  insert into public.proposal_views (id, proposal_id, seconds, user_agent)
  values (p_view_id, pid, greatest(0, least(p_seconds, 86400)), left(p_user_agent, 300))
  on conflict (id) do update set seconds = greatest(proposal_views.seconds, excluded.seconds)
  returning (xmax = 0) into is_new_view;

  update public.proposals set
    first_viewed_at = coalesce(first_viewed_at, now()),
    last_viewed_at = now(),
    view_count = view_count + case when is_new_view then 1 else 0 end,
    total_view_seconds = (select coalesce(sum(seconds), 0) from public.proposal_views where proposal_id = pid)
  where id = pid;

  return was_first;
end;
$$;

create or replace function public.proposal_accept(p_token text, p_name text, p_signature text, p_options jsonb, p_total numeric, p_user_agent text, p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prop public.proposals;
begin
  if not public.proposal_code_ok(p_token, p_code) then
    return jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  end if;
  select * into prop from public.proposals where token = p_token for update;
  if prop.id is null then
    return jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  end if;
  if prop.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This proposal has already been accepted.');
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(p_signature, '') not like 'data:image/png;base64,%' then
    return jsonb_build_object('ok', false, 'error', 'Please type your name and sign.');
  end if;

  update public.proposals set
    accepted_at = now(),
    accepted_name = left(trim(p_name), 200),
    accepted_signature = left(p_signature, 400000),
    accepted_options = coalesce(p_options, '[]'::jsonb),
    accepted_total = p_total,
    accepted_user_agent = left(p_user_agent, 300)
  where id = prop.id;

  update public.quotes set status = 'accepted' where id = prop.quote_id;

  return jsonb_build_object('ok', true, 'quote_id', prop.quote_id);
end;
$$;

grant execute on function public.proposal_code_ok(text, text) to anon, authenticated;
grant execute on function public.proposal_by_token(text, text) to anon, authenticated;
grant execute on function public.proposal_record_view(text, uuid, integer, text, text) to anon, authenticated;
grant execute on function public.proposal_accept(text, text, text, jsonb, numeric, text, text) to anon, authenticated;

-- Work orders: signed-in staff only.
revoke execute on function public.work_order_by_token(text) from anon;
revoke execute on function public.work_order_by_token(text) from public;
grant execute on function public.work_order_by_token(text) to authenticated;

select count(*) as proposals_with_codes from public.proposals where access_code is not null;
