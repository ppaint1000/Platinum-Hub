-- Run this once in the Supabase SQL Editor (same project used by both the
-- standalone Timesheets app and the Hub's in-development /timesheets
-- routes — this fixes it for both at once).
--
-- Why: migration_04_roles_and_settings.sql split the original "Admins can
-- manage all sites" policy (which covered every operation, delete
-- included) into separate select/insert/update policies — and never
-- added a delete policy back. With zero permissive policy for delete,
-- Postgres RLS silently blocks it for every user, including real admins:
-- the DELETE runs, matches zero rows, and returns no error at all.
-- That's exactly what made the Sites "Delete" button look broken — the
-- app code was fine, there was just nothing granting the permission.
--
-- customers had the identical gap from the same migration, but that one
-- was already caught and fixed separately — see
-- migration_08_customer_delete.sql. This is the sites-only remainder.

create policy "Admins can delete sites" on public.sites
  for delete using (public.is_admin());
