import { authenticateAdmin, json, getPrivateConfig, savePrivateConfig, isSameOrigin, safeText, getSupabaseConfig, supabaseRequest, supabaseApiKeyHeaders } from '../_lib/supabase.js';

function validSupabaseUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/i.test(u.hostname) && !u.username && !u.password; } catch { return false; }
}
function masked(value) { const s = String(value || ''); return s ? `${s.slice(0, 4)}••••${s.slice(-4)}` : ''; }

export async function onRequestGet({ request, env }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.profile.role !== 'owner') return json({ ok: false, error: 'owner_required' }, 403);
  try {
    const c = await getPrivateConfig(env);
    return json({ ok: true, storageReady: Boolean(env.CONFIG_KV && env.CONFIG_ENCRYPTION_KEY),
      supabase: { url: c.supabase?.url || '', publishableKey: masked(c.supabase?.publishableKey || c.supabase?.anonKey), secretKey: masked(c.supabase?.secretKey || c.supabase?.serviceRoleKey), anonKey: masked(c.supabase?.publishableKey || c.supabase?.anonKey), serviceRoleKey: masked(c.supabase?.secretKey || c.supabase?.serviceRoleKey), configured: Boolean(c.supabase?.url && (c.supabase?.publishableKey || c.supabase?.anonKey) && (c.supabase?.secretKey || c.supabase?.serviceRoleKey)) },
      telegram: { botToken: masked(c.telegram?.botToken), chatId: c.telegram?.chatId || '', enabled: Boolean(c.telegram?.enabled), configured: Boolean(c.telegram?.botToken && c.telegram?.chatId) },
      google_sheets: { appsScriptUrl: c.google_sheets?.appsScriptUrl || '', spreadsheetId: c.google_sheets?.spreadsheetId || '', enabled: Boolean(c.google_sheets?.enabled), configured: Boolean(c.google_sheets?.appsScriptUrl) }
    });
  } catch { return json({ ok: false, error: 'private_config_unavailable' }, 500); }
}

export async function onRequestPut({ request, env }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'origin_not_allowed' }, 403);
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.profile.role !== 'owner') return json({ ok: false, error: 'owner_required' }, 403);
  if (!env.CONFIG_KV || !env.CONFIG_ENCRYPTION_KEY || String(env.CONFIG_ENCRYPTION_KEY).length < 32) return json({ ok: false, error: 'secure_storage_not_configured' }, 503);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'json_required' }, 415);
  const bodyLength = Number(request.headers.get('content-length') || 0);
  if (bodyLength > 16000) return json({ ok: false, error: 'request_too_large' }, 413);
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  try {
    const current = await getPrivateConfig(env);
    const next = structuredClone(current);
    const section = safeText(body.section, 30);
    if (section === 'supabase') {
      const url = safeText(body.url, 300).replace(/\/$/, '');
      const anonKey = safeText(body.publishableKey ?? body.anonKey, 3000);
      const serviceRoleKey = safeText(body.secretKey ?? body.serviceRoleKey, 5000);
      if (url && !validSupabaseUrl(url)) return json({ ok: false, error: 'invalid_supabase_url' }, 400);
      if (url) next.supabase.url = url;
      if (anonKey) next.supabase.anonKey = anonKey;
      if (serviceRoleKey) next.supabase.serviceRoleKey = serviceRoleKey;
      if (!next.supabase.url || !next.supabase.anonKey || !next.supabase.serviceRoleKey) return json({ ok: false, error: 'supabase_fields_required' }, 400);
      // Validate candidate credentials before switching the active configuration.
      const response = await fetch(`${next.supabase.url}/auth/v1/settings`, { headers: { apikey: next.supabase.anonKey } });
      if (!response.ok) return json({ ok: false, error: 'supabase_anon_key_invalid' }, 422);
      const serviceResponse = await fetch(`${next.supabase.url}/rest/v1/`, { headers: supabaseApiKeyHeaders(next.supabase.serviceRoleKey) });
      if (!serviceResponse.ok) return json({ ok: false, error: 'supabase_service_key_invalid' }, 422);
    } else if (section === 'telegram') {
      const botToken = safeText(body.botToken, 300);
      const chatId = safeText(body.chatId, 100);
      if (botToken) next.telegram.botToken = botToken;
      if (chatId) next.telegram.chatId = chatId;
      next.telegram.enabled = Boolean(body.enabled);
      if (next.telegram.enabled && (!next.telegram.botToken || !next.telegram.chatId)) return json({ ok: false, error: 'telegram_fields_required' }, 400);
    } else if (section === 'google_sheets') {
      const appsScriptUrl = safeText(body.appsScriptUrl, 1000);
      const spreadsheetId = safeText(body.spreadsheetId, 300);
      if (appsScriptUrl) {
        let u; try { u = new URL(appsScriptUrl); } catch { return json({ ok: false, error: 'invalid_apps_script_url' }, 400); }
        if (u.protocol !== 'https:' || u.hostname !== 'script.google.com') return json({ ok: false, error: 'invalid_apps_script_url' }, 400);
        next.google_sheets.appsScriptUrl = appsScriptUrl;
      }
      if (spreadsheetId) next.google_sheets.spreadsheetId = spreadsheetId;
      next.google_sheets.enabled = Boolean(body.enabled);
      if (next.google_sheets.enabled && !next.google_sheets.appsScriptUrl) return json({ ok: false, error: 'sheets_url_required' }, 400);
    } else return json({ ok: false, error: 'invalid_section' }, 400);
    await savePrivateConfig(env, next);
    let auditLogged = true;
    try {
      const cfg = await getSupabaseConfig(env);
      if (cfg) await supabaseRequest(env, '/rest/v1/admin_activity_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_user_id: auth.user.id, action: 'connection.updated', target_type: 'connection', target_id: section, metadata: { configured: true } }) });
    } catch { auditLogged = false; }
    if (section === 'telegram' || section === 'google_sheets') {
      const provider = section;
      const enabled = provider === 'telegram' ? next.telegram.enabled : next.google_sheets.enabled;
      try {
        const cfg = await getSupabaseConfig(env);
        if (cfg) {
          await supabaseRequest(env, `/rest/v1/integration_settings?on_conflict=provider`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ provider, enabled, options: {}, updated_by: auth.user.id }) });
        }
      } catch { /* Encrypted configuration is authoritative; DB mirror can be retried. */ }
    }
    return json({ ok: true, section, auditLogged, message: auditLogged ? 'تم حفظ الإعدادات المشفرة وتسجيل العملية.' : 'تم حفظ الإعدادات المشفرة، لكن تعذر تسجيل العملية في سجل النشاط.' });
  } catch { return json({ ok: false, error: 'private_config_save_failed' }, 500); }
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'origin_not_allowed' }, 403);
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  if (auth.profile.role !== 'owner') return json({ ok: false, error: 'owner_required' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'json_required' }, 415);
  const bodyLength = Number(request.headers.get('content-length') || 0);
  if (bodyLength > 2000) return json({ ok: false, error: 'request_too_large' }, 413);
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  const section = safeText(body.section, 30);
  try {
    const c = await getPrivateConfig(env);
    if (section === 'telegram') {
      if (!c.telegram?.botToken || !c.telegram?.chatId) return json({ ok: false, error: 'telegram_not_configured' }, 400);
      const r = await fetch(`https://api.telegram.org/bot${c.telegram.botToken}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: c.telegram.chatId, text: 'اختبار اتصال من لوحة إدارة الموقع — Telegram يعمل بنجاح.' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return json({ ok: false, error: 'telegram_test_failed' }, 422);
      return json({ ok: true, detail: 'تم إرسال رسالة اختبار إلى Chat ID المحدد.' });
    }
    if (section === 'google_sheets') {
      if (!c.google_sheets?.appsScriptUrl) return json({ ok: false, error: 'sheets_not_configured' }, 400);
      const r = await fetch(c.google_sheets.appsScriptUrl, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ type: 'connection_test', spreadsheetId: c.google_sheets.spreadsheetId || '' }) });
      if (!r.ok) return json({ ok: false, error: 'sheets_test_failed' }, 422);
      const responseText = await r.text();
      let responseData = null;
      try { responseData = JSON.parse(responseText); } catch { /* Legacy Apps Script may return plain text. */ }
      if (responseData && responseData.ok !== true) return json({ ok: false, error: 'sheets_script_rejected_test' }, 422);
      return json({ ok: true, verified: Boolean(responseData?.ok === true), detail: responseData?.ok === true ? 'أكد تطبيق Apps Script نجاح اختبار الاتصال.' : 'تم الوصول إلى Apps Script، لكن لم يقدم تأكيداً منظماً بصيغة { ok: true }.' });
    }
    if (section === 'supabase') {
      const config = await getSupabaseConfig(env);
      if (!config) return json({ ok: false, error: 'supabase_not_configured' }, 400);
      const r = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.anonKey } });
      return r.ok ? json({ ok: true, detail: 'اتصال Supabase يعمل.' }) : json({ ok: false, error: 'supabase_test_failed' }, 422);
    }
    return json({ ok: false, error: 'invalid_section' }, 400);
  } catch { return json({ ok: false, error: 'connection_test_failed' }, 502); }
}
