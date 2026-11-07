import { authenticateAdmin, json, supabaseRequest } from '../../_lib/supabase.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function onRequestGet({ request, env, params }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const id = String(params?.id || '');
  if (!UUID.test(id)) return json({ ok: false, error: 'invalid_visitor_id' }, 400);
  try {
    const [visitor, sessions, events] = await Promise.all([
      supabaseRequest(env, `/rest/v1/visitors?id=eq.${id}&is_admin=eq.false&select=id,visitor_key,first_seen_at,last_seen_at,first_source,last_source,first_landing_path,last_landing_path&limit=1`),
      supabaseRequest(env, `/rest/v1/visitor_sessions?visitor_id=eq.${id}&is_admin=eq.false&select=id,started_at,last_activity_at,ended_at,landing_path,exit_path,source,utm_source,utm_medium,utm_campaign,device_type,browser,operating_system,country,city&order=started_at.desc&limit=50`),
      supabaseRequest(env, `/rest/v1/tracking_events?visitor_id=eq.${id}&is_admin=eq.false&select=event_type,page_path,occurred_at,source,campaign,properties&order=occurred_at.desc&limit=100`)
    ]);
    if (!visitor.data?.length) return json({ ok: false, error: 'visitor_not_found' }, 404);
    const row = visitor.data[0];
    row.visitor_key = `${String(row.visitor_key).slice(0, 5)}…${String(row.visitor_key).slice(-4)}`;
    return json({ ok: true, visitor: row, sessions: sessions.data || [], events: events.data || [] });
  } catch { return json({ ok: false, error: 'visitor_detail_failed' }, 500); }
}
