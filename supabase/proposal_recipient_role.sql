-- Platinum Painters Hub — the contact's role on a proposal letter (printed
-- under their name, before the company). Run once in the Supabase SQL Editor.
alter table public.proposals add column if not exists recipient_role text;
