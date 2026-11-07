import { authenticateAdmin, json, supabaseRequest, safeText } from '../_lib/supabase.js';
export async function onRequestGet({ request, env }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit') || 50);
  const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 50;
  const rawOffset = Number(url.searchParams.get('offset') || 0);
  const offset = Number.isInteger(rawOffset) ? Math.max(0, Math.min(1000000, rawOffset)) : 0;
  const source = safeText(url.searchParams.get('source'), 100);
  const since = safeText(url.searchParams.get('since'), 40);
  const until = safeText(url.searchParams.get('until'), 40);
  const filters = ['select=id,visitor_key,first_seen_at,last_seen_at,first_source,last_source,first_landing_path,last_landing_path', 'is_admin=eq.false'];
  if (source) filters.push(`first_source=ilike.*${encodeURIComponent(source)}*`);
  if (since && !Number.isNaN(Date.parse(since))) filters.push(`last_seen_at=gte.${encodeURIComponent(new Date(since).toISOString())}`);
  if (until && !Number.isNaN(Date.parse(until))) filters.push(`last_seen_at=lte.${encodeURIComponent(new Date(until).toISOString())}`);
  filters.push('order=last_seen_at.desc', `limit=${limit}`, `offset=${offset}`);
  try {
    const result = await supabaseRequest(env, `/rest/v1/visitors?${filters.join('&')}`, { headers: { Prefer: 'count=exact' } });
    const rows = (result.data || []).map(row => ({ ...row, visitor_key: `${String(row.visitor_key).slice(0, 5)}…${String(row.visitor_key).slice(-4)}` }));
    const contentRange = result.response.headers.get('content-range') || '';
    const total = Number(contentRange.split('/').pop()) || 0;
    return json({ ok: true, visitors: rows, limit, offset, total, has_more: offset + rows.length < total });
  } catch { return json({ ok: false, error: 'visitors_read_failed' }, 500); }
}
