-- Platinum Painters Hub — Marketing: a "Commercial property" group for
-- commercial property managers and asset managers (property services
-- firms and the listed property owners who run their own portfolios), with
-- a starting list from public websites (10 Nov 2026 - check before use).
-- Run once in the Supabase SQL Editor, AFTER marketing_groups.sql. Safe to re-run.

alter table public.marketing_companies drop constraint if exists marketing_companies_category_check;
alter table public.marketing_companies add constraint marketing_companies_category_check
  check (category in ('Body corporate', 'Retirement village', 'Building management', 'Commercial property'));

-- These two are commercial property / asset management rather than
-- apartment building management.
update public.marketing_companies set category = 'Commercial property'
where name in ('Colliers Real Estate Management', 'Cushman & Wakefield Auckland');

insert into public.marketing_companies (name, category, phone, email, address, website, notes) values
  -- Property services firms (manage buildings for owners)
  ('Bayleys Commercial Property Services', 'Commercial property', '09 309 6020', 'reception@bayleys.co.nz', '30 Gaunt Street, Auckland Central', 'bayleys.co.nz/propertyservices', 'Commercial property, facilities and occupier management. (Bayleys body corporate team is in the Body corporate group.)'),
  ('CBRE Auckland - Asset Services', 'Commercial property', null, null, 'Auckland', 'cbre.co.nz', 'Commercial property management (Asset Services).'),
  ('JLL New Zealand', 'Commercial property', null, null, 'Auckland', 'jll.com/en-nz', 'Property and facilities management. No property manager names published - call and ask who manages their Auckland portfolio.'),
  ('Barfoot & Thompson Commercial Asset Management', 'Commercial property', null, null, 'Auckland', 'barfoot.co.nz/branches/asset-management', 'Commercial property management and advisory.'),
  ('Oyster Property Group', 'Commercial property', '09 632 1287', null, 'Level 18, 55 Shortland Street, Auckland 1010', 'oystergroup.co.nz', 'Manages commercial, industrial and retail property incl. Millennium Centre (Greenlane). Emails usually j.doe@oystergroup.co.nz or john.doe@ (unverified).'),
  -- Listed property owners (in-house asset / property managers)
  ('Kiwi Property Group', 'Commercial property', '09 359 4000', null, 'Level 7, Vero Centre, 48 Shortland Street, Auckland', 'kp.co.nz', 'Sylvia Park, LynnMall and Auckland office/mixed-use. In-house asset and property managers.'),
  ('Precinct Properties', 'Commercial property', '0800 122 696', null, 'Level 12, HSBC Tower, Auckland 1010', 'precinct.co.nz', 'Auckland CBD office towers (Commercial Bay etc).'),
  ('Goodman Property Trust', 'Commercial property', '09 375 6060', null, 'Level 8, Beca House, Auckland 1010', 'nz.goodman.com', 'Industrial / logistics estates across Auckland.'),
  ('Argosy Property', 'Commercial property', null, null, 'Auckland', 'argosy.co.nz', 'Industrial, office and large-format retail, much of it in Auckland.'),
  ('Stride Property Group', 'Commercial property', null, null, 'Auckland', 'strideproperty.co.nz', 'Manages Stride, Investore and other funds.'),
  ('Property for Industry (PFI)', 'Commercial property', null, null, 'Auckland', 'propertyforindustry.co.nz', 'Industrial property, mostly Auckland.')
on conflict (name) do update set category = excluded.category;

insert into public.marketing_contacts (company_id, name, role, phone, email, notes)
select c.id, x.name, x.role, x.phone, x.email, x.notes
from (values
  ('Bayleys Commercial Property Services', 'Michael Thornton', 'General Manager, Property Services', '021 866 854', null, null),
  ('Bayleys Commercial Property Services', 'Justin Law', 'Head of Facilities Management', '021 241 6469', null, null),
  ('Bayleys Commercial Property Services', 'Tiana Warren', 'Head of Corporate and Occupier Services', '027 310 0608', null, null),
  ('Bayleys Commercial Property Services', 'Ashleigh Thomas', 'Head of Property Finance', '021 175 1511', null, null),
  ('CBRE Auckland - Asset Services', 'Fiona Saunders', 'National Director, Asset Services', null, null, null),
  ('CBRE Auckland - Asset Services', 'Duncan Christie', 'Associate Director, Asset Services', null, null, 'Manages several Auckland properties.'),
  ('Oyster Property Group', 'Mark Schiele', 'Chief Executive Officer', '09 632 1287', null, null),
  ('Oyster Property Group', 'Greg Wilder', 'Facilities Manager - Auckland southern corridor (Millennium Centre, Greenlane)', null, null, 'From an older news article - the same name also appears at Cadogan Building Management. Check where he is now.'),
  ('Oyster Property Group', 'Craig Nicholson', 'Retail Facilities Manager', null, null, null),
  ('Kiwi Property Group', 'Clive Mackenzie', 'Chief Executive Officer', '09 359 4000', null, 'Ask reception for the asset / property manager for each centre.'),
  ('Precinct Properties', 'Scott Pritchard', 'Chief Executive Officer', '0800 122 696', null, 'Ask for the building / facilities manager.'),
  ('Goodman Property Trust', 'James Spence', 'Chief Executive Officer', '09 375 6060', null, 'Ask for the property / facilities manager.')
) as x(company, name, role, phone, email, notes)
join public.marketing_companies c on c.name = x.company
where not exists (select 1 from public.marketing_contacts m where m.name = x.name and m.company_id = c.id and coalesce(m.role, '') = coalesce(x.role, ''));

-- Check: counts per group.
select category, count(*) as companies from public.marketing_companies group by category order by category;
