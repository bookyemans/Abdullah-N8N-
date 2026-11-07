import { authenticateAdmin, json, supabaseRequest, safeText } from '../_lib/supabase.js';

const ALLOWED_STATUSES = new Set(['new', 'in_progress', 'replied', 'closed', 'spam']);
function safeSearch(value) {
  return safeText(value, 80).replace(/[^\p{L}\p{N}@._+\-\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function csvCell(value) {
  let text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit') || 30);
  const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 30;
  const rawOffset = Number(url.searchParams.get('offset') || 0);
  const offset = Number.isInteger(rawOffset) ? Math.max(0, Math.min(1000000, rawOffset)) : 0;
  const status = safeText(url.searchParams.get('status'), 30);
  const search = safeSearch(url.searchParams.get('q'));
  const since = safeText(url.searchParams.get('since'), 40);
  const until = safeText(url.searchParams.get('until'), 40);
  if (url.searchParams.get('format') === 'csv' && auth.profile.role !== 'owner') return json({ ok: false, error: 'owner_required_for_export' }, 403);
  const params = new URLSearchParams({
    select: 'id,submission_ref,created_at,updated_at,status,status_updated_at,source_page,name,email,phone,company,service,budget,referral_source,delivery_status,visitor_id,session_id',
    order: 'created_at.desc', limit: String(url.searchParams.get('format') === 'csv' ? 5000 : limit), offset: String(offset)
  });
  if (ALLOWED_STATUSES.has(status)) params.set('status', `eq.${status}`);
  const dateFilters = [];
  if (since && !Number.isNaN(Date.parse(since))) dateFilters.push(`created_at.gte.${new Date(since).toISOString()}`);
  if (until && !Number.isNaN(Date.parse(until))) dateFilters.push(`created_at.lte.${new Date(`${until}T23:59:59.999Z`).toISOString()}`);
  if (dateFilters.length) params.set('and', `(${dateFilters.join(',')})`);
  if (search) params.set('or', `(name.ilike.*${search}*,email.ilike.*${search}*,phone.ilike.*${search}*,company.ilike.*${search}*,service.ilike.*${search}*)`);

  try {
    const [result, ...countResults] = await Promise.all([
      supabaseRequest(env, `/rest/v1/contact_submissions?${params.toString()}`, { headers: { Prefer: 'count=exact' } }),
      ...['new', 'in_progress', 'replied', 'closed', 'spam'].map(statusValue =>
        supabaseRequest(env, `/rest/v1/contact_submissions?select=id&status=eq.${statusValue}&limit=0`, { method: 'HEAD', headers: { Prefer: 'count=exact' } })
      )
    ]);
    const rows = result.data || [];
    const statusCounts = Object.fromEntries(['new', 'in_progress', 'replied', 'closed', 'spam'].map((key, index) => {
      const range = countResults[index].response.headers.get('content-range') || '';
      return [key, Number(range.split('/').pop()) || 0];
    }));
    if (url.searchParams.get('format') === 'csv') {
      const columns = ['created_at', 'status', 'name', 'email', 'phone', 'company', 'service', 'budget', 'referral_source', 'source_page', 'delivery_status'];
      const lines = [columns.join(','), ...rows.map(row => columns.map(key => csvCell(row[key])).join(','))];
      return new Response(`\uFEFF${lines.join('\r\n')}`, { headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="a5-leads.csv"',
        'cache-control': 'no-store'
      } });
    }
    const contentRange = result.response.headers.get('content-range') || '';
    const total = Number(contentRange.split('/').pop()) || rows.length;
    return json({ ok: true, leads: rows, limit, offset, total, has_more: offset + rows.length < total, status_counts: statusCounts });
  } catch { return json({ ok: false, error: 'leads_read_failed' }, 500); }
}
