-- Platinum Painters Hub — Marketing groups: each company is in a group
-- (Body corporate / Retirement village / Building management) so contacts
-- can be filtered and emailed with wording that suits them. Adds a starting
-- list of Auckland retirement village operators and their villages, and
-- building / facilities management companies (from public websites,
-- 10 Nov 2026 - check before use).
-- Run once in the Supabase SQL Editor, AFTER marketing.sql. Safe to re-run.

alter table public.marketing_companies add column if not exists category text not null default 'Body corporate';
alter table public.marketing_companies drop constraint if exists marketing_companies_category_check;
alter table public.marketing_companies add constraint marketing_companies_category_check
  check (category in ('Body corporate', 'Retirement village', 'Building management'));

-- Colliers is commercial / facilities management rather than a BC manager.
update public.marketing_companies set category = 'Building management' where name = 'Colliers Real Estate Management';

insert into public.marketing_companies (name, category, phone, email, address, website, notes) values
  -- Retirement village operators (head office / main line)
  ('Ryman Healthcare', 'Retirement village', '0800 000 290', null, null, 'rymanhealthcare.co.nz', '11 Auckland villages + Karaka and Takapuna planned. Maintenance is usually run from head office - ask each village who handles repaints.'),
  ('Metlifecare', 'Retirement village', '0800 909 303', null, null, 'metlifecare.co.nz', 'Many Auckland villages (Edgewater, Highlands, Longford Park, Powley, Crestwood, Pinesong, Poynton and more).'),
  ('Summerset', 'Retirement village', '04 894 7320', 'headoffice.reception@summerset.co.nz', 'Floor 27, Majestic Centre, 100 Willis Street, Wellington 6011', 'summerset.co.nz', 'Auckland: Half Moon Bay, St Johns, Monterey Park (Hobsonville), Karaka, Milldale, Parnell, Ellerslie. Sales/village line 0800 786 637.'),
  ('Arvida', 'Retirement village', null, null, null, 'arvida.co.nz', null),
  ('Oceania Healthcare', 'Retirement village', null, null, null, 'oceaniahealthcare.co.nz', null),
  ('Bupa Villages', 'Retirement village', null, null, null, 'bupa.co.nz', 'Auckland: Northhaven (Red Beach), Hugh Green (Albany), Erin Park (Manurewa).'),
  ('Baycrest Charitable Trust', 'Retirement village', null, null, '6 Walbrook Road, Manly, Auckland 0930', null, 'Independent - the village manager decides.'),
  ('St Andrew''s Village Trust', 'Retirement village', null, null, '207 Riddell Road, Glendowie, Auckland 1071', null, 'Independent - the village manager decides.'),
  ('Dutch Village Trust (Ons Dorp)', 'Retirement village', null, null, '36 McLeod Road, Henderson, Auckland 0612', null, 'Independent - the village manager decides.'),
  -- Building / facilities management
  ('Auckland City-Living Management', 'Building management', '09 377 9009', 'info@aclm.co.nz', 'Commercial 10 / 27 Union Street, Auckland Central', 'aucklandcityliving.co.nz', 'CBD building management for body corporates + property management.'),
  ('Cadogan Building Management', 'Building management', '09 470 4734', 'info@cadogan.co.nz', null, 'cadogan.co.nz', '14 buildings, ~660 apartments across Auckland (incl. The Palms). Live-in and non-live-in managers.'),
  ('NZ Building Management (NZBM)', 'Building management', null, null, null, 'nzbm.co.nz', 'Buildings incl. 8 Hereford Residences, Hopetoun, The Citizen, The Miro. Works with Strictly Body Corporate.'),
  ('Dymond McBain Facilities Management', 'Building management', '021 799 493', null, null, 'dmfm.co.nz', 'Residential, commercial and retail buildings (e.g. Lighter Quay, Perspective Apartments).'),
  ('Sarin Investments', 'Building management', null, null, null, 'sarin.co.nz', 'Building management incl. Proximity Apartments, Manukau.'),
  ('Cushman & Wakefield Auckland', 'Building management', '0800 544 333', null, '87 Albert Street (The Formery), Auckland 1010', 'cushmanwakefield.com', 'Commercial property and facilities management.'),
  ('Downer / Spotless Facilities', 'Building management', null, null, 'Auckland head office', 'downergroup.co.nz', 'Large facilities management contractor (Spotless, Hawkins). Use their "Supply to Downer" page to get on their subcontractor list.')
on conflict (name) do update set category = excluded.category;

insert into public.marketing_contacts (company_id, name, role, phone, email, notes)
select c.id, x.name, x.role, x.phone, x.email, x.notes
from (values
  -- Ryman villages (village reception - ask for the village manager)
  ('Ryman Healthcare', 'Village Manager', 'Bert Sutcliffe Village - 2 Rangatira Rd, Birkenhead', '09 482 1777', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Bruce McLaren Village - 795 Chapel Rd, Howick', '09 535 0220', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Edmund Hillary Village - 221 Abbotts Way, Remuera', '09 570 0070', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Evelyn Page Village - 30 Ambassador Glade, Orewa', '09 421 1915', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Grace Joel Village - 184 St Heliers Bay Rd, St Heliers', '09 575 1572', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Keith Park Village - 3 Scott Road, Hobsonville', '09 416 0751', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Logan Campbell Village - 187 Campbell Rd, Greenlane', '09 636 3888', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Miriam Corban Village - 211 Lincoln Rd, Henderson', '09 838 0888', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Murray Halberg Village - 11 Commodore Dr, Lynfield', '09 627 2700', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'Possum Bourne Village - 5 Lisle Farm Dr, Pukekohe', '09 238 0370', null, 'Name not published - ask reception.'),
  ('Ryman Healthcare', 'Village Manager', 'William Sanders Village - 7 Ngataringa Rd, Devonport', '09 445 0900', null, 'Name not published - ask reception.'),
  -- Metlifecare villages
  ('Metlifecare', 'Heather Himiona', 'Village Manager - Greenwich Gardens, 5 Greenwich Way, Unsworth Heights', null, null, null),
  ('Metlifecare', 'Craig Peploe', 'Village Manager - Parkside Village, 42 Herd Rd, Hillsborough', '09 624 2600', null, 'Another listing names Zabeen Azim - check who is current.'),
  ('Metlifecare', 'Cheryl Ashby', 'Village Manager - The Orchards, 123 Stanley Rd, Glenfield', null, null, null),
  ('Metlifecare', 'Aileen Gatchalian', 'Village Manager - Waitākere Gardens, 15 Sel Peacock Dr, Henderson', null, null, null),
  ('Metlifecare', 'Village Manager', 'The Poynton - 142 Shakespeare Rd, Takapuna', '09 488 5700', null, 'Reception number - ask for the village manager.'),
  -- Others
  ('Arvida', 'Helen Vlasich', 'Village Manager - Arvida Parklane, 106 Becroft Dr, Forrest Hill', null, null, null),
  ('Oceania Healthcare', 'Caroline Harrow', 'Village Manager - Lady Allum, 20 Napoleon Ave, Milford', null, null, null),
  ('Bupa Villages', 'Kerry Powell', 'Village Coordinator - Northhaven, 142 Whangaparāoa Rd, Red Beach', null, null, null),
  ('Baycrest Charitable Trust', 'Colin La Pere', 'Village Manager - Baycrest, Manly', null, null, null),
  ('St Andrew''s Village Trust', 'Liz Dilger', 'Village Manager - St Andrew''s Village, Glendowie', null, null, null),
  ('Dutch Village Trust (Ons Dorp)', 'Rajender Gill', 'Village Manager - Ons Dorp, Henderson', null, null, null),
  -- Building / facilities management
  ('Auckland City-Living Management', 'Stephen Zhao', 'Managing Director', '09 377 9009', null, null),
  ('Auckland City-Living Management', 'David Chapman', 'Building Manager', '09 377 9009', null, null),
  ('Cadogan Building Management', 'Laura', 'Director', '09 470 4734', 'info@cadogan.co.nz', 'Surname not published.'),
  ('Cadogan Building Management', 'Greg Wilder', 'Building Manager', '09 470 4734', null, null),
  ('NZ Building Management (NZBM)', 'Jamie Davies', 'Managing Director', null, null, null),
  ('Dymond McBain Facilities Management', 'Janet McBain', 'Director', '021 799 493', null, 'Role inferred from company name - check.'),
  ('Cushman & Wakefield Auckland', 'Mohy Sorour', 'National Technical Services Manager', '0800 544 333', null, null)
) as x(company, name, role, phone, email, notes)
join public.marketing_companies c on c.name = x.company
where not exists (select 1 from public.marketing_contacts m where m.name = x.name and m.company_id = c.id and coalesce(m.role, '') = coalesce(x.role, ''));

-- Check: counts per group.
select category, count(*) as companies from public.marketing_companies group by category order by category;
