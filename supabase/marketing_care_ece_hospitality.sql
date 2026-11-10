-- Platinum Painters Hub — Marketing: three more groups - "Aged care" (rest
-- homes / care homes), "Early childhood" (ECE centres and kindergartens) and
-- "Hospitality" (hotels, motels, serviced apartments) - with a starting list
-- of Auckland operators from public websites (10 Nov 2026 - check before use).
-- Run once in the Supabase SQL Editor, AFTER marketing_commercial.sql. Safe to re-run.

alter table public.marketing_companies drop constraint if exists marketing_companies_category_check;
alter table public.marketing_companies add constraint marketing_companies_category_check
  check (category in ('Body corporate', 'Retirement village', 'Building management', 'Commercial property', 'Aged care', 'Early childhood', 'Hospitality'));

insert into public.marketing_companies (name, category, phone, email, address, website, notes) values
  -- Aged care (Bupa, Oceania, Ryman and Metlifecare care homes sit with their villages in the Retirement village group)
  ('The Selwyn Foundation', 'Aged care', '09 845 0838', null, 'PO Box 8203, Newmarket, Auckland 1149', 'selwynfoundation.org.nz', 'Auckland charitable aged care provider - Selwyn Village (Pt Chevalier) care homes plus ~20 community centres across Auckland.'),
  ('Radius Residential Care', 'Aged care', '09 570 5565', null, null, 'radiuscare.co.nz', 'National care home operator (~24 sites). Auckland incl. Radius Waipuna, Mt Wellington.'),
  ('Heritage Lifecare', 'Aged care', null, null, null, 'heritagelifecare.co.nz', 'National care home operator. Auckland incl. Ellerslie Gardens Lifecare.'),
  ('Presbyterian Support Northern (Enliven)', 'Aged care', '09 520 8600', null, 'Level 3, 205 Great South Rd, Greenlane, Auckland 1051', 'enlivennorthern.org.nz', 'Runs Enliven care homes and services across the upper North Island.'),
  -- Early childhood
  ('Auckland Kindergarten Association', 'Early childhood', '09 373 5635', null, '385 Queen Street, Auckland 1010', 'mykindy.co.nz', '~111 kindergartens across Auckland - has its own property team.'),
  ('BestStart Educare', 'Early childhood', null, null, 'Auckland', 'beststart.org', 'NZ''s largest ECE operator (~258 centres), many in Auckland.'),
  ('Kindercare Learning Centres', 'Early childhood', '09 528 6671', null, '24 Melanesia Rd, Kohimarama, Auckland 1071', 'kindercare.co.nz', '~48 centres. A review says this number may not work - check.'),
  ('Evolve Education Group', 'Early childhood', null, null, 'Auckland', 'evolveeducation.co.nz', 'Lollipops Educare and Learning Adventures centres. Advertises in-house property maintenance roles - ask about external painting contractors.'),
  ('Provincial Education Group', 'Early childhood', null, null, 'Auckland', null, '~77 ECE services, Auckland head office.'),
  ('Counties Manukau Kindergarten Association', 'Early childhood', null, null, 'Takanini, Auckland', 'cmka.org.nz', '~28 kindergartens in South Auckland.'),
  ('Rainbow Corner Group', 'Early childhood', null, null, 'Flat Bush, Auckland', null, '~16 centres, East/South Auckland.'),
  -- Hospitality
  ('Accor New Zealand', 'Hospitality', '09 365 0000', null, 'Level 8, 99 Queen Street, Auckland (check - may have moved)', 'all.accor.com', 'Novotel, Ibis, Mercure, Pullman, Sofitel etc. Ask for the regional engineering / maintenance manager.'),
  ('Millennium & Copthorne Hotels NZ', 'Hospitality', null, null, '23 Customs Street East, Auckland', 'millenniumhotels.com', 'Copthorne Auckland City, Grand Millennium Auckland and others.'),
  ('Scenic Hotel Group', 'Hospitality', '0800 69 69 63', null, null, 'scenichotelgroup.co.nz', 'Auckland: Legacy Airedale Hotel (Queen St), Heartland Hotel Auckland Airport.'),
  ('Quest Apartment Hotels (Auckland)', 'Hospitality', null, null, null, 'questapartments.co.nz', 'Each Quest property is a franchise - contact the franchisee/GM at each Auckland property.'),
  ('Hospitality New Zealand (Auckland)', 'Hospitality', null, null, null, 'hospitality.org.nz', 'Industry association - its Auckland branch reaches motel and hotel owners. Ask about supplier membership / events.')
on conflict (name) do update set category = excluded.category;

insert into public.marketing_contacts (company_id, name, role, phone, email, notes)
select c.id, x.name, x.role, x.phone, x.email, x.notes
from (values
  ('Radius Residential Care', 'Jayson Edang', 'Facility Manager - Radius Waipuna, 118 Waipuna Rd East, Mt Wellington', '021 740 316', null, null),
  ('Heritage Lifecare', 'Facility Manager', 'Ellerslie Gardens Lifecare, 20 Clare Place, Mt Wellington', '09 570 1101', null, 'Name not published - ask reception.'),
  ('The Selwyn Foundation', 'Property Manager', 'Head office, Newmarket', '09 845 0838', null, 'Ask reception who looks after property / maintenance.'),
  ('Presbyterian Support Northern (Enliven)', 'Property Manager', 'Greenlane office', '09 520 8600', null, 'Ask reception who looks after property / maintenance.'),
  ('Auckland Kindergarten Association', 'Property Manager', 'Head office, 385 Queen St', '09 373 5635', null, 'Ask for the property team.'),
  ('Kindercare Learning Centres', 'Property Manager', 'Support office, Kohimarama', '09 528 6671', null, 'Ask who looks after centre maintenance.'),
  ('Scenic Hotel Group', 'General Manager', 'Legacy Airedale Hotel, 380 Queen St, Auckland', '09 374 1741', 'info@airedale.co.nz', null),
  ('Scenic Hotel Group', 'General Manager', 'Heartland Hotel Auckland Airport, 14 Airpark Dr, Airport Oaks', '09 275 4540', 'aucklandairport@heartlandhotels.co.nz', null),
  ('Accor New Zealand', 'Engineering Manager', 'Regional office, Auckland', '09 365 0000', null, 'Ask for the engineering / maintenance manager for Auckland hotels.')
) as x(company, name, role, phone, email, notes)
join public.marketing_companies c on c.name = x.company
where not exists (select 1 from public.marketing_contacts m where m.name = x.name and m.company_id = c.id and coalesce(m.role, '') = coalesce(x.role, ''));

-- Check: counts per group.
select category, count(*) as companies from public.marketing_companies group by category order by category;
