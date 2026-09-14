-- Platinum Painters Hub — Clients pipeline schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: column creation is guarded, same convention as
-- jobs_schema.sql / users_schema.sql. No RLS changes needed — the
-- existing admin-only policies on jobs/client_contacts already cover
-- these new columns.
--
-- Adds "who a lost job went to" + when, and an optional link from a
-- client contact to the specific job/project they're the contact for.

alter table public.jobs
  add column if not exists lost_at date,
  add column if not exists lost_to text;

alter table public.client_contacts
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

create index if not exists client_contacts_job_id_idx on public.client_contacts(job_id);
