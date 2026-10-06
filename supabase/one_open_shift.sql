-- One running shift per person, ever: a second clock-in (double tap, second
-- phone, admin clock-in) is rejected by the database while one is open.
create unique index if not exists timesheet_entries_one_open_per_user
  on public.timesheet_entries (user_id) where clock_out_at is null;
