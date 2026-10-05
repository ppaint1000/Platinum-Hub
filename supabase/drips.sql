-- Platinum Painters Hub — Drips (like DripJobs): automatic emails to
-- customers at each stage - a new enquiry, a proposal sent, a job paid
-- (Google review request), a lost quote - each a sequence of emails sent a
-- set number of days apart, stopping when it no longer applies (e.g. the
-- proposal is accepted). Admins set them up on the Drips page.
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.drip_settings (
  id boolean primary key default true check (id),
  -- Your Google Business "write a review" link, for {review_link}.
  google_review_url text,
  -- Everything stops sending while this is on.
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.drip_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.drip_sequences (
  id uuid primary key default gen_random_uuid(),
  trigger text not null unique check (trigger in ('request_created', 'proposal_sent', 'job_paid', 'job_lost')),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.drip_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.drip_sequences(id) on delete cascade,
  step_order integer not null,
  -- Days after the previous email (or after the trigger, for the first).
  delay_days integer not null default 0 check (delay_days >= 0),
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists drip_steps_seq_idx on public.drip_steps (sequence_id, step_order);

create table if not exists public.drip_enrolments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.drip_sequences(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  request_id uuid references public.requests(id) on delete cascade,
  proposal_id uuid references public.proposals(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  email text not null,
  name text,
  next_step integer not null default 0,
  next_send_at timestamptz,
  status text not null default 'active' check (status in ('active', 'done', 'stopped')),
  stopped_reason text,
  created_at timestamptz not null default now()
);
create index if not exists drip_enrolments_due_idx on public.drip_enrolments (status, next_send_at);
create unique index if not exists drip_enrolments_request_idx on public.drip_enrolments (sequence_id, request_id) where request_id is not null;
create unique index if not exists drip_enrolments_proposal_idx on public.drip_enrolments (sequence_id, proposal_id) where proposal_id is not null;
create unique index if not exists drip_enrolments_job_idx on public.drip_enrolments (sequence_id, job_id) where job_id is not null;

create table if not exists public.drip_sends (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.drip_enrolments(id) on delete cascade,
  step_id uuid references public.drip_steps(id) on delete set null,
  to_email text not null,
  subject text not null,
  sent boolean not null,
  error text,
  sent_at timestamptz not null default now()
);
create index if not exists drip_sends_time_idx on public.drip_sends (sent_at desc);

-- A customer who unsubscribes gets no more drip emails.
alter table public.clients add column if not exists drip_opt_out boolean not null default false;
alter table public.requests add column if not exists drip_opt_out boolean not null default false;
-- Individual automations turned off for one client (their triggers, e.g.
-- 'job_paid' for no Google review request) - the client page's tick boxes.
alter table public.clients add column if not exists drip_off text[] not null default '{}';

-- Admins only (the sending runs on the server).
do $$
declare t text;
begin
  foreach t in array array['drip_settings', 'drip_sequences', 'drip_steps', 'drip_enrolments', 'drip_sends'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all using (public.current_profile_role() = ''admin'') with check (public.current_profile_role() = ''admin'')', t || '_admin_all', t);
  end loop;
end $$;

-- ── Starting sequences (edit the wording on the Drips page) ──────────────

insert into public.drip_sequences (trigger, name, description, active) values
  ('request_created', 'New enquiry', 'Someone asks for a quote (website form or added on Requests).', true),
  ('proposal_sent', 'Proposal follow-up', 'A proposal link is sent. Stops when they accept or decline.', true),
  ('job_paid', 'Google review request', 'A job is marked Paid - ask for a Google review.', true),
  ('job_lost', 'Lost quote check-in', 'A quote is lost - a friendly check-in months later.', false)
on conflict (trigger) do nothing;

insert into public.drip_steps (sequence_id, step_order, delay_days, subject, body)
select s.id, x.step_order, x.delay_days, x.subject, x.body
from public.drip_sequences s
join (values
  ('request_created', 0, 0, 'Thanks for your enquiry - Platinum Painters',
   E'Hi {first_name},\n\nThanks for getting in touch with Platinum Painters. We''ve got your enquiry and one of our team will be in touch shortly to arrange a time to look at the job.\n\nIf it''s easier, call us on {phone}.\n\nThanks,\nPlatinum Painters'),
  ('request_created', 1, 3, 'Following up on your painting enquiry',
   E'Hi {first_name},\n\nJust following up on your painting enquiry. If you''d like to book a free measure and quote, reply to this email or call {phone} and we''ll find a time that suits.\n\nThanks,\nPlatinum Painters'),
  ('proposal_sent', 0, 3, 'Any questions about your painting proposal?',
   E'Hi {first_name},\n\nJust checking you received our proposal for {job}. You can view it, choose any options and accept it online here:\n\n{proposal_link}\nYour code: {proposal_code}\n\nHappy to answer any questions - reply to this email or call {phone}.\n\nThanks,\nPlatinum Painters'),
  ('proposal_sent', 1, 7, 'Your painting proposal for {job}',
   E'Hi {first_name},\n\nWe''d love to help with {job}. If anything in the proposal needs changing - scope, colours or timing - just let us know and we''ll update it.\n\n{proposal_link}\nYour code: {proposal_code}\n\nThanks,\nPlatinum Painters'),
  ('job_paid', 0, 2, 'How did we do?',
   E'Hi {first_name},\n\nThanks for choosing Platinum Painters for {job}. We hope you''re enjoying the result!\n\nIf you were happy with our work, would you mind leaving us a quick Google review? It really helps a small local business like ours:\n\n{review_link}\n\nThanks again,\nPlatinum Painters'),
  ('job_lost', 0, 180, 'Still thinking about painting?',
   E'Hi {first_name},\n\nA while ago we quoted on {job}. If you''re still thinking about it, or have another painting job coming up, we''d be glad to help - call {phone} or reply to this email.\n\nThanks,\nPlatinum Painters')
) as x(trigger, step_order, delay_days, subject, body) on x.trigger = s.trigger
where not exists (select 1 from public.drip_steps d where d.sequence_id = s.id);

-- The Proposal follow-up drip replaces the single customer reminder (Settings
-- > Proposal templates), so customers don't get both.
update public.proposal_settings set customer_reminder_days = 0 where customer_reminder_days <> 0;

-- Check: should show sequences = 4, steps = 6.
select (select count(*) from public.drip_sequences) as sequences, (select count(*) from public.drip_steps) as steps;
