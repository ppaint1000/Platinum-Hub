-- New Zealand dates in the database. Postgres runs in UTC here, so
-- current_date and to_char(now(), ...) give yesterday until 1pm NZ (and last
-- year's job numbers on the morning of 1 January).
--
-- The database's own timezone stays UTC on purpose: changing it would change
-- how every timestamp is sent to the app. Instead this finds what uses the
-- date and fixes only those. Safe to run more than once.

do $$
declare
  r record;
begin
  -- Columns that default to today.
  for r in
    select table_name, column_name
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_default ilike '%current_date%'
  loop
    execute format(
      'alter table public.%I alter column %I set default ((now() at time zone ''Pacific/Auckland'')::date)',
      r.table_name, r.column_name
    );
    raise notice 'default changed: %.%', r.table_name, r.column_name;
  end loop;

  -- Functions and triggers that read today's date or year. Their code is
  -- left alone: they just run in NZ time.
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosrc ~* 'current_date|to_char\(\s*now\(\)'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'TimeZone=%')
  loop
    execute format('alter function %s set timezone = %L', r.fn, 'Pacific/Auckland');
    raise notice 'function changed: %', r.fn;
  end loop;
end
$$;

-- Check: both lists should be empty / every function shown as Pacific/Auckland.
select table_name, column_name, column_default
from information_schema.columns
where table_schema = 'public' and column_default ilike '%current_date%';

select p.oid::regprocedure as function_name, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ~* 'current_date|to_char\(\s*now\(\)';
