-- Platinum Painters Hub — deleting absences.
--
-- An admin can delete any absence. It's kept (with dismissed_at set) rather
-- than removed, so the "who hasn't clocked in" check - which catches up on
-- missed working days - never flags that person for that day again. A
-- deleted absence is hidden everywhere in the Hub.

alter table public.absences add column if not exists dismissed_at timestamptz;
