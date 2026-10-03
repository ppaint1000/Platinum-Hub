-- Platinum Painters Hub — Measures and Costing move into the Hub.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- The tables are the same as the old Measures app's (same names and
-- columns, so the data copies straight across), except:
--   - customers are the Hub's clients: quotes.customer_id and
--     site_measures.customer_id point at clients(id)
--   - each costing and site measure has an owner (owner_id, whoever made
--     it). Admins see everything; everyone else needs the Measures /
--     Costing tick on the Users page and sees only their own.

-- ── Who can use them ────────────────────────────────────────────────────

alter table public.user_app_access add column if not exists measures boolean not null default false;
alter table public.user_app_access add column if not exists costing boolean not null default false;

create or replace function public.mc_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.is_active, true));
$$;

-- 'measures' or 'costing': admin, or ticked on the Users page.
create or replace function public.mc_can(p_app text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.mc_is_admin() or exists (
    select 1
    from public.user_app_access a
    join public.profiles p on p.id = a.user_id
    where a.user_id = auth.uid()
      and coalesce(p.is_active, true)
      and case p_app when 'measures' then a.measures when 'costing' then a.costing else false end
  );
$$;

-- ── Settings and price lists ────────────────────────────────────────────

create table if not exists public.costing_settings (
  id uuid default gen_random_uuid() not null primary key,
  labour_rate_sell numeric(10,2) default 55 not null,
  labour_rate_cost numeric(10,2) default 30 not null,
  standard_paint_sell numeric(10,2) default 16 not null,
  standard_paint_cost numeric(10,2) default 12 not null,
  other_paint_1_sell numeric(10,2) default 25.60 not null,
  other_paint_1_cost numeric(10,2) default 20 not null,
  other_paint_2_sell numeric(10,2) default 1.60 not null,
  other_paint_2_cost numeric(10,2),
  other_paint_3_sell numeric(10,2) default 1.60 not null,
  other_paint_3_cost numeric(10,2),
  spread_rate_sqm_per_litre numeric(10,2) default 12 not null,
  overtime_pct numeric(6,4) default 0.20 not null,
  overtime_rate numeric(10,2) default 4.00 not null,
  overtime_default_enabled boolean default false not null,
  repaint_coats integer default 2 not null,
  general_prep_rate_sqm_per_hr numeric(10,2) default 50 not null,
  markup_material_pct numeric(6,4) default 0.20 not null,
  markup_other_pct numeric(6,4) default 0.20 not null,
  negotiating_factor_pct numeric(6,4) default -0.10 not null,
  gst_pct numeric(6,4) default 0.15 not null,
  updated_at timestamptz default now() not null,
  paint_flat_addition numeric(10,2) default 1.60 not null,
  night_shift_allowance_rate numeric(10,2) default 5.00 not null,
  exterior_wash_rate numeric(10,2) default 65.00 not null,
  exterior_wash_markup_pct numeric(6,4) default 0.20 not null
);

create table if not exists public.costing_surface_types (
  id uuid default gen_random_uuid() not null primary key,
  name text not null,
  sort_order integer default 0 not null,
  default_girth numeric(6,3) default 1 not null,
  default_coats integer default 2 not null,
  labour_productivity_sqm_per_hr numeric(10,2) default 12 not null,
  prep_rate_sqm_per_hr numeric(10,2) default 25 not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  category text default 'Internal' not null,
  unit text default 'm²/hr' not null
);

create table if not exists public.costing_access_rates (
  id uuid default gen_random_uuid() not null primary key,
  name text not null,
  rate_type text default 'Hire' not null,
  unit text default 'no.' not null,
  cost numeric(10,2) default 0 not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists public.costing_line_item_names (
  id uuid default gen_random_uuid() not null primary key,
  name text not null unique,
  created_at timestamptz default now() not null
);

create table if not exists public.paint_products (
  id uuid default gen_random_uuid() not null primary key,
  name text not null,
  brand text,
  cost_per_litre numeric(10,2) default 0 not null,
  coverage_sqm_per_litre numeric(10,2) default 10 not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  is_default boolean default false not null
);
create unique index if not exists paint_products_single_default on public.paint_products ((true)) where is_default;

create table if not exists public.surface_presets (
  id uuid default gen_random_uuid() not null primary key,
  name text not null,
  paint_product_id uuid references public.paint_products(id) on delete set null,
  labour_rate_per_sqm numeric(10,2) default 0 not null,
  coats integer default 2 not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists public.proposal_settings (
  id boolean default true not null primary key check (id),
  cover_title text default 'PAINTING PROPOSAL' not null,
  header_line text default 'Platinum Painters NZ   www.platinumpainters.co.nz   021 116 4005' not null,
  letter_intro text,
  signoff text,
  about_text text,
  methodology text,
  terms text,
  completed_projects jsonb default '[]'::jsonb not null,
  updated_at timestamptz default now() not null,
  letter_banner text,
  company_block text,
  signer text,
  signature_path text,
  equipment_title text,
  equipment_caption text,
  equipment_photos jsonb,
  back_pages jsonb,
  why_text text
);

-- ── Costings ────────────────────────────────────────────────────────────

create table if not exists public.quotes (
  id uuid default gen_random_uuid() not null primary key,
  customer_id uuid not null references public.clients(id) on delete restrict,
  owner_id uuid default auth.uid() references public.profiles(id) on delete set null,
  status text default 'draft' not null,
  valid_until date,
  notes text,
  discount numeric(10,2) default 0 not null,
  tax_rate numeric(6,2) default 0 not null,
  subtotal numeric(10,2) default 0 not null,
  total numeric(10,2) default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  location text,
  labour_rate_sell numeric(10,2),
  labour_rate_cost numeric(10,2),
  standard_paint_sell numeric(10,2),
  standard_paint_cost numeric(10,2),
  other_paint_1_sell numeric(10,2),
  other_paint_1_cost numeric(10,2),
  other_paint_2_sell numeric(10,2),
  other_paint_2_cost numeric(10,2),
  other_paint_3_sell numeric(10,2),
  other_paint_3_cost numeric(10,2),
  spread_rate_sqm_per_litre numeric(10,2),
  overtime_pct numeric(6,4),
  overtime_rate numeric(10,2),
  overtime_enabled boolean default false not null,
  repaint_coats integer,
  general_prep_rate_sqm_per_hr numeric(10,2),
  markup_material_pct numeric(6,4),
  markup_other_pct numeric(6,4),
  negotiating_factor_pct numeric(6,4),
  gst_pct numeric(6,4),
  project text,
  allowance_site numeric(10,2) default 0 not null,
  allowance_other numeric(10,2) default 0 not null,
  labour_sell_override numeric(10,2),
  labour_cost_override numeric(10,2),
  schedule_men numeric(6,2) default 4 not null,
  schedule_hours_per_week numeric(6,2) default 40 not null,
  work_order_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
create index if not exists quotes_owner_idx on public.quotes(owner_id);
create index if not exists quotes_customer_idx on public.quotes(customer_id);

create table if not exists public.quote_buildings (
  id uuid default gen_random_uuid() not null primary key,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text default '' not null,
  sort_order integer default 0 not null,
  paint_product_id uuid references public.paint_products(id) on delete set null,
  excludes text,
  note text,
  overtime_enabled boolean default false not null,
  created_at timestamptz default now() not null,
  category text default 'Internal' not null,
  sheeting_up_enabled boolean default true not null,
  sheeting_up_pct numeric(6,4) default 0.10 not null,
  night_shift_enabled boolean default false not null,
  night_shift_rate numeric(10,2),
  auto_wash_enabled boolean default true not null,
  summary_selected boolean default false not null,
  out_of_hours_enabled boolean default false not null,
  out_of_hours_rate numeric(10,2) default 0 not null,
  is_option boolean default false not null,
  option_group text
);
create index if not exists quote_buildings_quote_idx on public.quote_buildings(quote_id);

create table if not exists public.quote_building_lines (
  id uuid default gen_random_uuid() not null primary key,
  building_id uuid not null references public.quote_buildings(id) on delete cascade,
  surface_name text not null,
  girth numeric(6,3) default 1 not null,
  qty numeric(10,2) default 0 not null,
  coats integer default 2 not null,
  labour_rate numeric(10,2) default 12 not null,
  spread_rate numeric(10,2) default 12 not null,
  material_rate numeric(10,2) default 0 not null,
  prep_rate numeric(10,2) default 50 not null,
  hours numeric(10,3) default 0 not null,
  litres numeric(10,3) default 0 not null,
  cost numeric(10,2) default 0 not null,
  calc_rate numeric(10,2) default 0 not null,
  prep_hours numeric(10,3) default 0 not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  paint_product_id uuid references public.paint_products(id) on delete set null,
  line_type text default 'surface' not null,
  unit_price numeric(10,2),
  markup_pct numeric(6,4)
);
create index if not exists quote_building_lines_building_idx on public.quote_building_lines(building_id);

create table if not exists public.quote_line_items (
  id uuid default gen_random_uuid() not null primary key,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) default 1 not null,
  unit_price numeric(10,2) default 0 not null,
  line_total numeric(10,2) default 0 not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null,
  building_id uuid references public.quote_buildings(id) on delete cascade,
  markup_pct numeric(6,4),
  is_access boolean default false not null,
  scaffold_group uuid,
  scaffold_role text check (scaffold_role = any (array['edt', 'hire'])),
  is_option boolean default false not null,
  option_group text
);
create index if not exists quote_line_items_quote_idx on public.quote_line_items(quote_id);

create table if not exists public.quote_areas (
  id uuid default gen_random_uuid() not null primary key,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text not null,
  surface_preset_id uuid references public.surface_presets(id) on delete set null,
  paint_product_id uuid references public.paint_products(id) on delete set null,
  length_m numeric(10,2),
  width_m numeric(10,2),
  sqm numeric(10,2) default 0 not null,
  labour_rate_per_sqm numeric(10,2) default 0 not null,
  coats integer default 2 not null,
  line_total numeric(10,2) default 0 not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null
);

-- ── Site measures ───────────────────────────────────────────────────────

create table if not exists public.site_measures (
  id uuid default gen_random_uuid() not null primary key,
  customer_id uuid references public.clients(id) on delete restrict,
  owner_id uuid default auth.uid() references public.profiles(id) on delete set null,
  location text,
  project text,
  email text,
  photos_taken boolean default false not null,
  measured_on date default current_date not null,
  buildings jsonb default '[]'::jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  status text default 'draft' not null,
  sent_costing_id uuid references public.quotes(id) on delete set null
);
create index if not exists site_measures_owner_idx on public.site_measures(owner_id);

-- ── Proposals ───────────────────────────────────────────────────────────

create table if not exists public.proposals (
  id uuid default gen_random_uuid() not null primary key,
  quote_id uuid not null unique references public.quotes(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  proposal_date date default current_date not null,
  recipient_name text,
  recipient_company text,
  recipient_address text,
  salutation text,
  site_address text,
  letter text,
  extent_includes text,
  extent_excludes text,
  spec_intro text,
  spec_rows jsonb default '[]'::jsonb not null,
  site_plan jsonb default '[]'::jsonb not null,
  site_plan_notes text,
  pricing jsonb default '{"items": [], "total": 0, "options": []}'::jsonb not null,
  pricing_labels jsonb default '{}'::jsonb not null,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer default 0 not null,
  total_view_seconds integer default 0 not null,
  accepted_at timestamptz,
  accepted_name text,
  accepted_signature text,
  accepted_options jsonb,
  accepted_total numeric(12,2),
  accepted_user_agent text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  subject text,
  condition_photos jsonb default '[]'::jsonb not null,
  sections jsonb
);

create table if not exists public.proposal_views (
  id uuid not null primary key,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  started_at timestamptz default now() not null,
  seconds integer default 0 not null,
  user_agent text
);
create index if not exists proposal_views_proposal_idx on public.proposal_views(proposal_id, started_at desc);

-- ── Who sees which costing ──────────────────────────────────────────────

create or replace function public.mc_quote_visible(p_quote uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.mc_is_admin() or (
    public.mc_can('costing')
    and exists (select 1 from public.quotes q where q.id = p_quote and q.owner_id = auth.uid())
  );
$$;

create or replace function public.mc_building_visible(p_building uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.mc_quote_visible((select b.quote_id from public.quote_buildings b where b.id = p_building));
$$;

-- Non-admins can't hand a costing or measure to someone else.
create or replace function public.mc_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id and auth.uid() is not null and not public.mc_is_admin() then
    raise exception 'Only an admin can change who a costing or measure belongs to.';
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_guard_owner on public.quotes;
create trigger quotes_guard_owner before update of owner_id on public.quotes
  for each row execute function public.mc_guard_owner();
drop trigger if exists site_measures_guard_owner on public.site_measures;
create trigger site_measures_guard_owner before update of owner_id on public.site_measures
  for each row execute function public.mc_guard_owner();

-- ── Row level security ──────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['costing_settings','costing_surface_types','costing_access_rates','costing_line_item_names',
    'paint_products','surface_presets','proposal_settings','quotes','quote_buildings','quote_building_lines',
    'quote_line_items','quote_areas','site_measures','proposals','proposal_views']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Settings and price lists: anyone using Measures or Costing reads them, admins change them.
  foreach t in array array['costing_settings','costing_surface_types','costing_access_rates','paint_products',
    'surface_presets','proposal_settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (public.mc_can(''costing'') or public.mc_can(''measures''))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all using (public.mc_is_admin()) with check (public.mc_is_admin())', t || '_admin_write', t);
  end loop;
end $$;

-- Extra-cost names build up as people type new ones.
drop policy if exists costing_line_item_names_read on public.costing_line_item_names;
create policy costing_line_item_names_read on public.costing_line_item_names
  for select using (public.mc_can('costing'));
drop policy if exists costing_line_item_names_add on public.costing_line_item_names;
create policy costing_line_item_names_add on public.costing_line_item_names
  for insert with check (public.mc_can('costing'));
drop policy if exists costing_line_item_names_admin on public.costing_line_item_names;
create policy costing_line_item_names_admin on public.costing_line_item_names
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

-- Costings: admin all; otherwise ticked and your own. A site measure sent
-- to costing makes a costing, so Measures users can create (their own).
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes
  for select using (public.mc_is_admin() or (public.mc_can('costing') and owner_id = auth.uid()));
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes
  for insert with check (public.mc_is_admin() or ((public.mc_can('costing') or public.mc_can('measures')) and owner_id = auth.uid()));
drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes
  for update using (public.mc_is_admin() or (public.mc_can('costing') and owner_id = auth.uid()))
  with check (public.mc_is_admin() or (public.mc_can('costing') and owner_id = auth.uid()));
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes
  for delete using (public.mc_is_admin() or (public.mc_can('costing') and owner_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['quote_buildings','quote_line_items','quote_areas','proposals']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_by_quote', t);
    execute format('create policy %I on public.%I for all using (public.mc_quote_visible(quote_id)) with check (public.mc_quote_visible(quote_id))', t || '_by_quote', t);
  end loop;
end $$;

-- Sending a site measure to costing copies its buildings in as the new
-- costing's owner - covered by the policies above once the quote is theirs.
drop policy if exists quote_building_lines_by_building on public.quote_building_lines;
create policy quote_building_lines_by_building on public.quote_building_lines
  for all using (public.mc_building_visible(building_id)) with check (public.mc_building_visible(building_id));

drop policy if exists proposal_views_select on public.proposal_views;
create policy proposal_views_select on public.proposal_views
  for select using (public.mc_quote_visible((select p.quote_id from public.proposals p where p.id = proposal_id)));

drop policy if exists site_measures_select on public.site_measures;
create policy site_measures_select on public.site_measures
  for select using (public.mc_is_admin() or (public.mc_can('measures') and owner_id = auth.uid()));
drop policy if exists site_measures_insert on public.site_measures;
create policy site_measures_insert on public.site_measures
  for insert with check (public.mc_is_admin() or (public.mc_can('measures') and owner_id = auth.uid()));
drop policy if exists site_measures_update on public.site_measures;
create policy site_measures_update on public.site_measures
  for update using (public.mc_is_admin() or (public.mc_can('measures') and owner_id = auth.uid()))
  with check (public.mc_is_admin() or (public.mc_can('measures') and owner_id = auth.uid()));
drop policy if exists site_measures_delete on public.site_measures;
create policy site_measures_delete on public.site_measures
  for delete using (public.mc_is_admin() or (public.mc_can('measures') and owner_id = auth.uid()));

-- Clients: Measures/Costing users see their own clients (and the client on
-- any costing or measure of theirs) and can add new ones as theirs.
drop policy if exists clients_mc_select on public.clients;
create policy clients_mc_select on public.clients
  for select using (
    (public.mc_can('costing') or public.mc_can('measures')) and (
      sales_person_id = auth.uid()
      or exists (select 1 from public.quotes q where q.customer_id = clients.id and q.owner_id = auth.uid())
      or exists (select 1 from public.site_measures m where m.customer_id = clients.id and m.owner_id = auth.uid())
    )
  );
drop policy if exists clients_mc_insert on public.clients;
create policy clients_mc_insert on public.clients
  for insert with check ((public.mc_can('costing') or public.mc_can('measures')) and sales_person_id = auth.uid());
drop policy if exists clients_mc_update on public.clients;
create policy clients_mc_update on public.clients
  for update using ((public.mc_can('costing') or public.mc_can('measures')) and sales_person_id = auth.uid())
  with check ((public.mc_can('costing') or public.mc_can('measures')) and sales_person_id = auth.uid());

-- ── The customer's proposal link and the crew's work order link ─────────
-- No sign-in: the long random token is the key.

create or replace function public.proposal_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'proposal', to_jsonb(p) - 'accepted_user_agent',
    'quote', jsonb_build_object('location', q.location, 'project', q.project, 'valid_until', q.valid_until, 'status', q.status, 'owner_id', q.owner_id),
    'customer', jsonb_build_object('name', c.name),
    'settings', to_jsonb(s)
  )
  from public.proposals p
  join public.quotes q on q.id = p.quote_id
  left join public.clients c on c.id = q.customer_id
  left join public.proposal_settings s on true
  where p.token = p_token and length(p_token) >= 32;
$$;

create or replace function public.proposal_record_view(p_token text, p_view_id uuid, p_seconds integer, p_user_agent text)
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
  select id, first_viewed_at is null into pid, was_first from public.proposals where token = p_token and length(p_token) >= 32;
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

create or replace function public.proposal_accept(p_token text, p_name text, p_signature text, p_options jsonb, p_total numeric, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prop public.proposals;
begin
  select * into prop from public.proposals where token = p_token and length(p_token) >= 32 for update;
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

create or replace function public.work_order_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'quote', jsonb_build_object('location', q.location, 'notes', q.notes),
    'customer', c.name,
    'buildings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'category', b.category,
          'excludes', b.excludes,
          'note', b.note,
          'paint_product_id', b.paint_product_id,
          'sheeting_up_enabled', b.sheeting_up_enabled,
          'sheeting_up_pct', b.sheeting_up_pct,
          'sort_order', b.sort_order,
          'is_option', b.is_option,
          'quote_building_lines', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', l.id,
              'line_type', l.line_type,
              'surface_name', l.surface_name,
              'qty', l.qty,
              'coats', l.coats,
              'hours', l.hours,
              'litres', l.litres,
              'prep_hours', l.prep_hours,
              'paint_product_id', l.paint_product_id,
              'unit_price', case when l.unit_price is null then null else 0 end,
              'sort_order', l.sort_order
            ))
            from public.quote_building_lines l
            where l.building_id = b.id
          ), '[]'::jsonb)
        )
        order by b.sort_order
      )
      from public.quote_buildings b
      where b.quote_id = q.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'building_id', i.building_id,
          'description', i.description,
          'quantity', i.quantity,
          'is_access', i.is_access,
          'is_option', i.is_option
        )
        order by i.sort_order
      )
      from public.quote_line_items i
      where i.quote_id = q.id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'brand', p.brand, 'is_default', p.is_default))
      from public.paint_products p
    ), '[]'::jsonb)
  )
  from public.quotes q
  left join public.clients c on c.id = q.customer_id
  where q.work_order_token = p_token and length(p_token) >= 32;
$$;

grant execute on function public.proposal_by_token(text) to anon, authenticated;
grant execute on function public.proposal_record_view(text, uuid, integer, text) to anon, authenticated;
grant execute on function public.proposal_accept(text, text, text, jsonb, numeric, text) to anon, authenticated;
grant execute on function public.work_order_by_token(text) to anon, authenticated;

-- ── Pictures on proposals (public read: the customer's page shows them) ─

insert into storage.buckets (id, name, public)
values ('proposal-images', 'proposal-images', true)
on conflict (id) do nothing;

drop policy if exists "proposal_images_write" on storage.objects;
create policy "proposal_images_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'proposal-images' and public.mc_can('costing'))
  with check (bucket_id = 'proposal-images' and public.mc_can('costing'));
