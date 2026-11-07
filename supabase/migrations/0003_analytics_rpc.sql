-- Bounded, server-side analytics aggregation. Avoids downloading thousands of raw events.
begin;

create or replace function public.admin_analytics_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)));
  v_result jsonb;
begin
  if not public.is_active_admin() then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;

  with filtered as (
    select * from public.tracking_events
    where is_admin = false and occurred_at >= v_since
  ), daily as (
    select date_trunc('day', occurred_at) as day_utc,
      count(*) filter (where event_type in ('page_view','visit')) as page_views,
      count(distinct visitor_id) filter (where event_type in ('page_view','visit')) as unique_visitors,
      count(distinct session_id) filter (where event_type in ('page_view','visit')) as sessions,
      count(*) filter (where event_type = 'whatsapp_click') as whatsapp_clicks,
      count(*) filter (where event_type = 'cta_click') as cta_clicks,
      count(*) filter (where event_type = 'contact_submit') as contact_submissions
    from filtered group by 1 order by 1
  ), pages as (
    select page_path, count(*) as page_views, count(distinct visitor_id) as unique_visitors
    from filtered where event_type in ('page_view','visit')
    group by page_path order by page_views desc limit 20
  ), sources as (
    select coalesce(nullif(source,''),'direct / unknown') as source,
      coalesce(nullif(campaign,''),'(not set)') as campaign,
      count(*) as events, count(distinct visitor_id) as unique_visitors
    from filtered where event_type in ('page_view','visit')
    group by 1,2 order by events desc limit 20
  ), event_counts as (
    select event_type, count(*) as total from filtered group by event_type
  ), sessions as (
    select count(*) as total_sessions,
      count(*) filter (where started_at >= v_since) as sessions_in_range,
      count(*) filter (where ended_at is not null and ended_at >= v_since) as ended_sessions
    from public.visitor_sessions where is_admin = false and started_at >= v_since
  ), geography as (
    select coalesce(nullif(country,''),'غير معروف') as country, count(*) as sessions
    from public.visitor_sessions where is_admin = false and started_at >= v_since
    group by 1 order by sessions desc limit 10
  ), devices as (
    select coalesce(nullif(device_type,''),'غير معروف') as device, count(*) as sessions
    from public.visitor_sessions where is_admin = false and started_at >= v_since
    group by 1 order by sessions desc limit 10
  )
  select jsonb_build_object(
    'range_days', v_days,
    'unique_visitors', (select count(distinct visitor_id) from filtered where event_type in ('page_view','visit')),
    'total_page_views', (select count(*) from filtered where event_type in ('page_view','visit')),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily) order by day_utc) from daily), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(to_jsonb(pages)) from pages), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(sources)) from sources), '[]'::jsonb),
    'event_counts', coalesce((select jsonb_object_agg(event_type,total) from event_counts), '{}'::jsonb),
    'sessions', (select to_jsonb(sessions) from sessions),
    'countries', coalesce((select jsonb_agg(to_jsonb(geography)) from geography), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(devices)) from devices), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_analytics_summary(integer) from public, anon;
grant execute on function public.admin_analytics_summary(integer) to authenticated;

commit;
