-- Run after all seven migrations in the Supabase SQL Editor.
-- Structural verification only; identity-based RLS acceptance tests remain separate.
do $$
declare
  required_tables text[] := array[
    'visitors','visitor_sessions','tracking_events','contact_submissions',
    'email_open_events','site_settings','integration_settings','admin_profiles',
    'admin_activity_logs','export_jobs'
  ];
  required_views text[] := array[
    'analytics_daily_summary','analytics_top_pages','analytics_sources'
  ];
  required_functions text[] := array[
    'is_active_admin','is_owner','admin_analytics_summary','admin_conversion_summary'
  ];
  item text;
  missing_count integer;
begin
  foreach item in array required_tables loop
    if to_regclass(format('public.%I', item)) is null then
      raise exception 'Missing required table: public.%', item;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=item and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', item;
    end if;
  end loop;

  foreach item in array required_views loop
    if to_regclass(format('public.%I', item)) is null then
      raise exception 'Missing required view: public.%', item;
    end if;
  end loop;

  foreach item in array required_functions loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=item
    ) then
      raise exception 'Missing required function: public.%', item;
    end if;
  end loop;

  -- Privileged tables must not grant browser-role writes.
  if has_table_privilege('anon', 'public.admin_profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.admin_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'UPDATE') then
    raise exception 'Unexpected browser-role write privilege on admin_profiles';
  end if;

  -- Browser roles must not execute the trigger-maintenance function directly.
  if has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE') then
    raise exception 'Unexpected browser-role EXECUTE privilege on set_updated_at';
  end if;

  select count(*) into missing_count
  from (values
    ('active admins read visitors'),
    ('active admins read sessions'),
    ('active admins read tracking events'),
    ('admins read own profile or owner reads all'),
    ('owners read export jobs')
  ) expected(policy_name)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.policyname=expected.policy_name
  );
  if missing_count > 0 then
    raise exception 'Missing % expected RLS policies', missing_count;
  end if;

  raise notice 'Supabase structural verification passed: % tables, % views, % functions, RLS and key grants checked.',
    cardinality(required_tables), cardinality(required_views), cardinality(required_functions);
end;
$$;
