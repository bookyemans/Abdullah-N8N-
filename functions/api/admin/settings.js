import { authenticateAdmin, json, supabaseRequest, safeText, isSameOrigin } from '../_lib/supabase.js';
export async function onRequestGet({ request, env }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  try {
    const [settings, integrations] = await Promise.all([
      supabaseRequest(env, '/rest/v1/site_settings?select=key,value,description,updated_at&order=key.asc'),
      supabaseRequest(env, '/rest/v1/integration_settings?select=provider,enabled,options,last_tested_at,last_test_status&order=provider.asc')
    ]);
    return json({ ok: true, settings: settings.data || [], integrations: integrations.data || [] });
  } catch { return json({ ok: false, error: 'settings_read_failed' }, 500); }
}
export async function onRequestPut({ request, env }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'origin_not_allowed' }, 403);
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.profile.role !== 'owner') return json({ ok: false, error: 'owner_required' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'json_required' }, 415);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  try {
    if (body?.provider) {
      const provider = safeText(body.provider, 40);
      if (!['google_sheets', 'telegram'].includes(provider) || typeof body.enabled !== 'boolean') return json({ ok: false, error: 'invalid_integration' }, 400);
      const options = body.options && typeof body.options === 'object' && !Array.isArray(body.options) ? body.options : {};
      if (JSON.stringify(options).length > 4000) return json({ ok: false, error: 'integration_options_too_large' }, 413);
      await supabaseRequest(env, '/rest/v1/integration_settings?on_conflict=provider', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ provider, enabled: body.enabled, options, updated_by: auth.user.id })
      });
      await supabaseRequest(env, '/rest/v1/admin_activity_logs', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ actor_user_id: auth.user.id, action: 'integration.updated', target_type: 'integration', target_id: provider, metadata: { enabled: body.enabled } })
      });
      return json({ ok: true, provider, enabled: body.enabled });
    }
    const key = safeText(body?.key, 100);
    if (!/^[a-z][a-z0-9_.-]{0,99}$/.test(key) || !Object.hasOwn(body || {}, 'value')) return json({ ok: false, error: 'invalid_setting' }, 400);
    if (JSON.stringify(body.value).length > 8000) return json({ ok: false, error: 'setting_too_large' }, 413);
    await supabaseRequest(env, '/rest/v1/site_settings?on_conflict=key', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, value: body.value, description: safeText(body.description, 300) || null, updated_by: auth.user.id })
    });
    await supabaseRequest(env, '/rest/v1/admin_activity_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ actor_user_id: auth.user.id, action: 'site_setting.updated', target_type: 'site_setting', target_id: key, metadata: {} })
    });
    return json({ ok: true, key });
  } catch { return json({ ok: false, error: 'setting_write_failed' }, 500); }
}
