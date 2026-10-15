-- Platinum Painters Hub — attach a file (invoice, job sheet, photo) to a
-- service record, like the receipt photo on a fuel entry.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- The file goes in the existing private fleet-photos bucket, under the
-- uploading admin's own folder (its insert policy only allows that), and
-- admins/supervisors can already read anything in it - so no new storage
-- policies are needed. Fleet → Servicing opens it via a signed link.

alter table public.service_records add column if not exists attachment_path text;
alter table public.service_records add column if not exists attachment_name text;
