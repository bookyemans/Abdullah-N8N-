import { authenticateAdmin, json, supabaseRequest } from '../_lib/supabase.js';
function validDays(value) { const n = Number(value || 30); return Number.isInteger(n) ? Math.max(1, Math.min(90, n)) : 30; }
export async function onRequestGet({ request, env }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const days = validDays(new URL(request.url).searchParams.get('days'));
  try {
    // Execute as the authenticated admin (anon key + user's access token),
    // so the SQL function can verify auth.uid() and enforce admin membership.
    const result = await supabaseRequest(env, '/rest/v1/rpc/admin_analytics_summary', {
      method: 'POST', useAnon: true, accessToken: auth.token,
      body: JSON.stringify({ p_days: days })
    });
    return json({ ok: true, ...(result.data || { range_days: days }) });
  } catch (error) {
    const status = error?.status === 401 ? 401 : error?.status === 403 ? 403 : 500;
    return json({ ok: false, error: status === 403 ? 'admin_access_required' : 'analytics_query_failed' }, status);
  }
}
