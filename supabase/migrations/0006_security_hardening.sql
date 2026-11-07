-- Final privilege hardening for helper/trigger functions.
-- Trigger functions remain executable by PostgreSQL triggers; they are not callable as app RPCs.
begin;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.touch_contact_submission() from public, anon, authenticated;
revoke all on function public.is_active_admin() from public, anon;
revoke all on function public.is_owner() from public, anon;

-- Explicitly lock down the privileged aggregation RPCs to authenticated callers.
-- Their SECURITY DEFINER bodies independently verify active-admin membership.
revoke all on function public.admin_analytics_summary(integer) from public, anon;
revoke all on function public.admin_conversion_summary(integer) from public, anon;
grant execute on function public.admin_analytics_summary(integer) to authenticated;
grant execute on function public.admin_conversion_summary(integer) to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- No direct authenticated writes to privileged tables; Pages Functions use the privileged server credential
-- only after validating the caller's Supabase access token and admin profile.
revoke insert, update, delete, truncate, references, trigger
  on public.visitors, public.visitor_sessions, public.tracking_events,
     public.contact_submissions, public.email_open_events, public.site_settings,
     public.integration_settings, public.admin_profiles, public.admin_activity_logs,
     public.export_jobs
  from anon, authenticated;

commit;
