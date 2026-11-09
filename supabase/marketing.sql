-- Platinum Painters Hub — Marketing: body corporate / building management
-- companies and their managers, a portfolio of buildings we've painted (with
-- photos, linked to the company that manages them), and email campaigns sent
-- from the Hub. Each email can show the buildings we've done for that
-- manager's company, and always carries an unsubscribe link (/mu/<token>).
-- Admins only. Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.marketing_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text,
  email text,
  address text,
  website text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.marketing_companies(id) on delete set null,
  name text not null,
  role text,
  phone text,
  email text,
  notes text,
  -- Not contacted / Emailed / Replied / Meeting booked / Quoting / Won / Not interested
  status text not null default 'Not contacted',
  last_contacted date,
  follow_up date,
  unsubscribed boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);
create index if not exists marketing_contacts_company_idx on public.marketing_contacts (company_id);

create table if not exists public.marketing_buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  company_id uuid references public.marketing_companies(id) on delete set null,
  year_painted integer,
  description text,
  -- [{ "path": "...", "url": "https://..." }] in the marketing-photos bucket
  photos jsonb not null default '[]'::jsonb,
  -- Shown to managers whose company has no buildings of its own yet.
  featured boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists marketing_buildings_company_idx on public.marketing_buildings (company_id);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  contact_id uuid references public.marketing_contacts(id) on delete set null,
  to_email text not null,
  subject text not null,
  sent boolean not null,
  error text,
  sent_at timestamptz not null default now()
);
create index if not exists marketing_sends_time_idx on public.marketing_sends (sent_at desc);

do $$
declare t text;
begin
  foreach t in array array['marketing_companies', 'marketing_contacts', 'marketing_buildings', 'marketing_campaigns', 'marketing_sends'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all using (public.current_profile_role() = ''admin'') with check (public.current_profile_role() = ''admin'')', t || '_admin_all', t);
  end loop;
end $$;

-- ── Building photos (public read: they're shown inside the emails) ────────

insert into storage.buckets (id, name, public)
values ('marketing-photos', 'marketing-photos', true)
on conflict (id) do nothing;

drop policy if exists "marketing_photos_write" on storage.objects;
create policy "marketing_photos_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'marketing-photos' and public.current_profile_role() = 'admin')
  with check (bucket_id = 'marketing-photos' and public.current_profile_role() = 'admin');

-- ── Starting list (from public websites, 9 Nov 2026 - check before use) ──

insert into public.marketing_companies (name, phone, email, address, website, notes) values
  ('Crockers Body Corporate Management', '0800 2762 5377', null, '525 Manukau Road, Epsom, Auckland 1023', 'crockers.co.nz', 'NZ''s largest BC manager (~1,100 bodies corporate). Staff emails usually firstname@crockers.co.nz (unverified).'),
  ('Barfoot & Thompson Body Corporate', '09 834 8425', 'bodycorporate@barfoot.co.nz', 'Body Corporate Branch, Auckland', 'barfoot.co.nz/bodycorporate', 'Manager emails are via the contact form on each barfoot.co.nz profile.'),
  ('Strata Title Administration', '09 307 3747', null, '1st Floor, Dilworth Building, cnr Queen & Customs Streets, Auckland Central', 'stratatitle.co.nz', '25+ BC specialists.'),
  ('Bayleys Property Services', '09 375 6868', 'enquiries@bayleys.co.nz', 'Bayleys House, 30 Gaunt Street, Auckland Central', 'bayleys.co.nz', 'Body corporate management within the Bayleys Group.'),
  ('First Street Body Corp Management', null, null, 'Auckland', null, 'Auckland since 2006. Says it takes no commissions from contractors.'),
  ('Lochore''s Body Corp', null, null, '8 Flynn Street, Birkdale, Auckland 0626', null, 'North Shore.'),
  ('Colliers Real Estate Management', '09 358 9876', null, 'Auckland CBD', 'colliers.com/en-nz', 'Commercial / facilities management; some BC management.')
on conflict (name) do nothing;

insert into public.marketing_contacts (company_id, name, role, phone, email)
select c.id, x.name, x.role, x.phone, x.email
from (values
  ('Barfoot & Thompson Body Corporate', 'Megan Stanton', 'Body Corporate Division Manager', '027 500 8989', null),
  ('Barfoot & Thompson Body Corporate', 'Rochelle Williams', 'Body Corporate Operations Manager', '021 843 031', null),
  ('Barfoot & Thompson Body Corporate', 'Raveena Mudliar', 'Senior Body Corporate Manager', '027 222 6734', null),
  ('Barfoot & Thompson Body Corporate', 'Lynne Halstead', 'Senior Body Corporate Manager', '021 500 894', null),
  ('Barfoot & Thompson Body Corporate', 'Philip Kloppers', 'Body Corporate Manager', '029 124 8261', null),
  ('Barfoot & Thompson Body Corporate', 'Emily Chen-Borger', 'Body Corporate Manager', '027 478 3283', null),
  ('Barfoot & Thompson Body Corporate', 'David Little', 'Body Corporate Manager', '022 699 7935', null),
  ('Barfoot & Thompson Body Corporate', 'Karen Blincoe', 'Body Corporate Manager', null, null),
  ('Barfoot & Thompson Body Corporate', 'Olivia Lattimore', 'Body Corporate Manager', null, null),
  ('Barfoot & Thompson Body Corporate', 'Taylor Maxwell', 'Body Corporate Onboarding Manager', null, null),
  ('Strata Title Administration', 'Kyle O''Reilly', 'Auckland Head of Body Corporate Management', null, 'kyle@stratatitle.co.nz'),
  ('Strata Title Administration', 'Phillip Lockyer', 'Business Development Manager / Director', null, 'philliplockyer@stratatitle.co.nz'),
  ('Strata Title Administration', 'Dale Morris', 'Senior Business Development Manager', null, 'dalemorris@stratatitle.co.nz'),
  ('Strata Title Administration', 'Doug Wilson', 'Chief Technical Manager', null, 'dougwilson@stratatitle.co.nz'),
  ('Strata Title Administration', 'Leah Hidalgo', 'Team Lead & Senior BC Manager', null, 'leahhidalgo@stratatitle.co.nz'),
  ('Strata Title Administration', 'Lynn Cormack', 'Team Lead & Senior BC Manager', null, 'lynncormack@stratatitle.co.nz'),
  ('Strata Title Administration', 'Ellie Johns', 'Senior BC Manager', null, 'elliejohns@stratatitle.co.nz'),
  ('Strata Title Administration', 'Martin Caie', 'Senior BC Manager', null, 'Martin@stratatitle.co.nz'),
  ('Strata Title Administration', 'Nicola Elston', 'Senior BC Manager', null, 'Nicola.Elston@stratatitle.co.nz'),
  ('Strata Title Administration', 'Rainbow Zhong', 'BC Manager', null, 'rainbow@stratatitle.co.nz'),
  ('Strata Title Administration', 'Brandon Zaragoza', 'BC Manager', null, 'brandonzaragoza@stratatitle.co.nz'),
  ('Strata Title Administration', 'William Xu', 'BC Manager', null, 'William@stratatitle.co.nz'),
  ('Strata Title Administration', 'Chantel de Vos', 'BC Manager', null, 'Chantel@stratatitle.co.nz'),
  ('Strata Title Administration', 'Leigh Pringle', 'BC Manager', null, 'Leigh@stratatitle.co.nz'),
  ('Crockers Body Corporate Management', 'Darren Powell', 'CEO', null, null),
  ('Crockers Body Corporate Management', 'Helen O''Sullivan', 'Body corporate specialist', null, null),
  ('Bayleys Property Services', 'Stuart Bent', 'National Director - Professional Services', null, null),
  ('Bayleys Property Services', 'Andrea Wong', 'National Manager', null, null),
  ('Colliers Real Estate Management', 'Tommy Webb', 'Facilities Management', '021 982 016', null),
  ('Colliers Real Estate Management', 'Jacqui Swart', 'Body Corporate Manager (Hamilton)', null, null)
) as x(company, name, role, phone, email)
join public.marketing_companies c on c.name = x.company
where not exists (select 1 from public.marketing_contacts m where m.name = x.name and m.company_id = c.id);

-- Check: should show companies = 7, contacts = 30.
select (select count(*) from public.marketing_companies) as companies, (select count(*) from public.marketing_contacts) as contacts;
