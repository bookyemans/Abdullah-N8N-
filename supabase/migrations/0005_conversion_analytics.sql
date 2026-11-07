-- Lead conversion analytics. All aggregation stays inside PostgreSQL.
begin;

create or replace function public.admin_conversion_summary(p_days integer default 30)
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

  with
  views as (
    select * from public.tracking_events
    where is_admin = false
      and event_type in ('page_view', 'visit')
      and occurred_at >= v_since
  ),
  leads as (
    select cs.*,
      coalesce(nullif(btrim(vs.utm_source), ''),
               nullif(btrim(vs.source), ''),
               nullif(btrim(cs.referral_source), ''),
               'direct / unknown') as attributed_source
    from public.contact_submissions cs
    left join public.visitor_sessions vs on vs.id = cs.session_id
    where cs.created_at >= v_since
  ),
  visitor_sources as (
    select coalesce(nullif(btrim(vs.utm_source), ''), nullif(btrim(vs.source), ''), 'direct / unknown') as source,
           count(distinct vs.visitor_id) as visitors
    from public.visitor_sessions vs
    where vs.is_admin = false and vs.started_at >= v_since
    group by 1
  ),
  lead_sources as (
    select attributed_source as source,
           count(*) as leads,
           count(distinct visitor_id) as converted_visitors
    from leads
    where status <> 'spam'
    group by 1
  ),
  source_rows as (
    select coalesce(vs.source, ls.source) as source,
           coalesce(vs.visitors, 0) as visitors,
           coalesce(ls.leads, 0) as leads,
           coalesce(ls.converted_visitors, 0) as converted_visitors,
           case when coalesce(vs.visitors, 0) > 0
             then round((coalesce(ls.converted_visitors, 0)::numeric / vs.visitors) * 100, 2)
             else 0 end as conversion_rate
    from visitor_sources vs
    full outer join lead_sources ls on ls.source = vs.source
  ),
  daily_dates as (
    select generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') as day_utc
  ),
  daily_rows as (
    select d.day_utc,
      (select count(*) from views v where v.occurred_at >= d.day_utc and v.occurred_at < d.day_utc + interval '1 day') as page_views,
      (select count(distinct v.visitor_id) from views v where v.occurred_at >= d.day_utc and v.occurred_at < d.day_utc + interval '1 day') as visitors,
      (select count(*) from leads l where l.created_at >= d.day_utc and l.created_at < d.day_utc + interval '1 day' and l.status <> 'spam') as leads
    from daily_dates d
  ),
  service_rows as (
    select coalesce(nullif(btrim(service), ''), 'غير محدد') as service, count(*) as leads
    from leads where status <> 'spam'
    group by 1 order by leads desc limit 12
  ),
  status_rows as (
    select status, count(*) as total from leads group by status
  ),
  page_rows as (
    select coalesce(nullif(source_page, ''), '/') as page_path,
      count(*) as leads,
      count(distinct visitor_id) as converted_visitors
    from leads where status <> 'spam'
    group by 1 order by leads desc limit 12
  ),
  totals as (
    select
      (select count(distinct visitor_id) from views) as unique_visitors,
      (select count(*) from views) as page_views,
      (select count(*) from public.visitor_sessions where is_admin = false and started_at >= v_since) as sessions,
      (select count(*) from leads where status <> 'spam') as total_leads,
      (select count(distinct visitor_id) from leads where status <> 'spam' and visitor_id is not null) as converted_visitors,
      (select count(*) from leads where status in ('new','in_progress')) as open_leads,
      (select count(*) from leads where status = 'replied') as replied_leads,
      (select count(*) from leads where status = 'closed') as closed_leads,
      (select count(*) from leads where status = 'spam') as spam_leads,
      (select count(*) from public.tracking_events where is_admin = false and event_type = 'whatsapp_click' and occurred_at >= v_since) as whatsapp_clicks
  )
  select jsonb_build_object(
    'range_days', v_days,
    'totals', jsonb_build_object(
      'unique_visitors', totals.unique_visitors,
      'page_views', totals.page_views,
      'sessions', totals.sessions,
      'total_leads', totals.total_leads,
      'converted_visitors', totals.converted_visitors,
      'conversion_rate', case when totals.unique_visitors > 0 then round((totals.converted_visitors::numeric / totals.unique_visitors) * 100, 2) else 0 end,
      'lead_rate', case when totals.unique_visitors > 0 then round((totals.total_leads::numeric / totals.unique_visitors) * 100, 2) else 0 end,
      'open_leads', totals.open_leads,
      'replied_leads', totals.replied_leads,
      'closed_leads', totals.closed_leads,
      'spam_leads', totals.spam_leads,
      'whatsapp_clicks', totals.whatsapp_clicks
    ),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily_rows) order by day_utc) from daily_rows), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(source_rows) order by leads desc, visitors desc) from source_rows), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(to_jsonb(service_rows) order by leads desc) from service_rows), '[]'::jsonb),
    'statuses', coalesce((select jsonb_object_agg(status, total) from status_rows), '{}'::jsonb),
    'top_pages', coalesce((select jsonb_agg(to_jsonb(page_rows) order by leads desc) from page_rows), '[]'::jsonb)
  ) into v_result
  from totals;

  return v_result;
end;
$$;

revoke all on function public.admin_conversion_summary(integer) from public, anon;
grant execute on function public.admin_conversion_summary(integer) to authenticated;

commit;
