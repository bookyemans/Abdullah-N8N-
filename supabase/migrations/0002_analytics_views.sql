-- Lightweight, bounded aggregate views for the first analytics dashboard.
-- Views contain no direct personal data and exclude admin traffic.
begin;

create or replace view public.analytics_daily_summary
with (security_invoker = true) as
select
  date_trunc('day', e.occurred_at) as day_utc,
  count(*) filter (where e.event_type in ('page_view', 'visit')) as page_views,
  count(distinct e.visitor_id) filter (where e.event_type in ('page_view', 'visit')) as unique_visitors,
  count(distinct e.session_id) filter (where e.event_type in ('page_view', 'visit')) as sessions,
  count(*) filter (where e.event_type = 'whatsapp_click') as whatsapp_clicks,
  count(*) filter (where e.event_type = 'cta_click') as cta_clicks,
  count(*) filter (where e.event_type = 'contact_submit') as contact_submissions
from public.tracking_events e
where e.is_admin = false
group by date_trunc('day', e.occurred_at);

create or replace view public.analytics_top_pages
with (security_invoker = true) as
select
  e.page_path,
  count(*) filter (where e.event_type in ('page_view', 'visit')) as page_views,
  count(distinct e.visitor_id) as unique_visitors
from public.tracking_events e
where e.is_admin = false
  and e.event_type in ('page_view', 'visit')
group by e.page_path;

create or replace view public.analytics_sources
with (security_invoker = true) as
select
  coalesce(nullif(e.source, ''), 'direct / unknown') as source,
  coalesce(nullif(e.campaign, ''), '(not set)') as campaign,
  count(*) as events,
  count(distinct e.visitor_id) as unique_visitors
from public.tracking_events e
where e.is_admin = false
  and e.event_type in ('page_view', 'visit')
group by 1, 2;

-- Views are admin-only. security_invoker means underlying table RLS remains in force.
revoke all on public.analytics_daily_summary, public.analytics_top_pages, public.analytics_sources from anon, authenticated;
grant select on public.analytics_daily_summary, public.analytics_top_pages, public.analytics_sources to authenticated;

commit;
