import { authenticateAdmin, json, supabaseRequest, safeText, isSameOrigin } from '../../_lib/supabase.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['new', 'in_progress', 'replied', 'closed', 'spam']);

export async function onRequestGet({ request, env, params }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const id = String(params?.id || '');
  if (!UUID.test(id)) return json({ ok: false, error: 'invalid_lead_id' }, 400);
  try {
    const result = await supabaseRequest(env, `/rest/v1/contact_submissions?id=eq.${id}&select=id,submission_ref,created_at,updated_at,status,status_updated_at,source_page,visitor_id,session_id,name,email,phone,company,service,budget,referral_source,message,admin_note,delivery_status,delivery_error,notification_sent_at&limit=1`);
    if (!result.data?.length) return json({ ok: false, error: 'lead_not_found' }, 404);
    return json({ ok: true, lead: result.data[0] });
  } catch { return json({ ok: false, error: 'lead_read_failed' }, 500); }
}

export async function onRequestPatch({ request, env, params }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'origin_not_allowed' }, 403);
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const id = String(params?.id || '');
  if (!UUID.test(id)) return json({ ok: false, error: 'invalid_lead_id' }, 400);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'json_required' }, 415);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  const update = {};
  if (Object.hasOwn(body || {}, 'status')) {
    if (!STATUSES.has(body.status)) return json({ ok: false, error: 'invalid_lead_status' }, 400);
    update.status = body.status;
  }
  if (Object.hasOwn(body || {}, 'admin_note')) update.admin_note = safeText(body.admin_note, 3000) || null;
  if (!Object.keys(update).length) return json({ ok: false, error: 'no_valid_changes' }, 400);
  try {
    const result = await supabaseRequest(env, `/rest/v1/contact_submissions?id=eq.${id}&select=id,status,admin_note,updated_at,status_updated_at`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update)
    });
    if (!result.data?.length) return json({ ok: false, error: 'lead_not_found' }, 404);
    await supabaseRequest(env, '/rest/v1/admin_activity_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ actor_user_id: auth.user.id, action: 'lead.updated', target_type: 'contact_submission', target_id: id, metadata: { changed_fields: Object.keys(update), status: update.status || null } })
    });
    return json({ ok: true, lead: result.data[0] });
  } catch { return json({ ok: false, error: 'lead_update_failed' }, 500); }
}
