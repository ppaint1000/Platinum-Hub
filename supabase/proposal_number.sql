-- Platinum Painters Hub — a proposal number (shown as P-1001 etc.) so the
-- Acceptance page says exactly what's being accepted. Existing proposals
-- are numbered oldest first. Run once in the Supabase SQL Editor. Safe to re-run.
create sequence if not exists public.proposal_number_seq start 1001;

alter table public.proposals add column if not exists proposal_number integer;

update public.proposals p
set proposal_number = n.num
from (
  select id, nextval('public.proposal_number_seq') as num
  from (select id from public.proposals where proposal_number is null order by created_at, id) o
) n
where p.id = n.id;

alter table public.proposals alter column proposal_number set default nextval('public.proposal_number_seq');
alter sequence public.proposal_number_seq owned by public.proposals.proposal_number;
create unique index if not exists proposals_proposal_number_key on public.proposals (proposal_number);

select proposal_number, created_at from public.proposals order by proposal_number;
