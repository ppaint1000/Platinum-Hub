-- Absences: "Rained off" as a reason. Kept on record, not counted as an
-- absence (the weather, not the person). Safe to re-run.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.absences'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%absence_type%'
  loop
    execute format('alter table public.absences drop constraint %I', c);
  end loop;
end $$;

alter table public.absences add constraint absences_absence_type_check
  check (absence_type in ('sick', 'authorised_leave', 'unauthorised_leave', 'not_rostered', 'rained_off'));
