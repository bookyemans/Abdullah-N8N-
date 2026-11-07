const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

const PRIVATE_CONFIG_KEY = 'a5:private-config:v1';

async function encryptionKey(env) {
  const secret = String(env.CONFIG_ENCRYPTION_KEY || '');
  if (secret.length < 32) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function decryptPrivateConfig(env) {
  if (!env.CONFIG_KV) return null;
  const stored = await env.CONFIG_KV.get(PRIVATE_CONFIG_KEY);
  if (!stored) return null;
  const key = await encryptionKey(env);
  if (!key) throw new Error('config_encryption_key_missing');
  const [ivPart, dataPart] = stored.split('.');
  if (!ivPart || !dataPart) throw new Error('private_config_corrupt');
  const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(ivPart) }, key, decode(dataPart));
  return JSON.parse(new TextDecoder().decode(clear));
}

export async function savePrivateConfig(env, value) {
  if (!env.CONFIG_KV) throw new Error('config_kv_not_bound');
  const key = await encryptionKey(env);
  if (!key) throw new Error('config_encryption_key_missing');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clear = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear));
  const encode = bytes => btoa(String.fromCharCode(...bytes));
  await env.CONFIG_KV.put(PRIVATE_CONFIG_KEY, `${encode(iv)}.${encode(encrypted)}`);
}

export async function getPrivateConfig(env) {
  const saved = await decryptPrivateConfig(env);
  return saved || {
    supabase: { url: env.SUPABASE_URL || '', anonKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '', serviceRoleKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '' },
    telegram: { botToken: env.TELEGRAM_BOT_TOKEN || '', chatId: env.TELEGRAM_CHAT_ID || '', enabled: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) },
    google_sheets: { appsScriptUrl: env.GOOGLE_APPS_SCRIPT_URL || '', spreadsheetId: '', enabled: env.GOOGLE_SHEETS_ENABLED === 'true' }
  };
}

export async function getSupabaseConfig(env) {
  const all = await getPrivateConfig(env);
  const url = String(all.supabase?.url || '').replace(/\/$/, '');
  const anonKey = all.supabase?.publishableKey || all.supabase?.anonKey;
  const serviceKey = all.supabase?.secretKey || all.supabase?.serviceRoleKey;
  if (!url || !/^https:\/\/[a-z0-9.-]+$/i.test(url) || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}


export function supabaseApiKeyHeaders(apiKey, extra = {}) {
  const headers = new Headers(extra);
  headers.set('apikey', apiKey);
  // New opaque API keys are not JWTs and must not be sent as Bearer tokens.
  if (!String(apiKey || '').startsWith('sb_')) headers.set('authorization', `Bearer ${apiKey}`);
  else headers.delete('authorization');
  return headers;
}

export async function supabaseRequest(env, path, options = {}) {
  const config = await getSupabaseConfig(env);
  if (!config) throw new Error('supabase_not_configured');
  const headers = new Headers(options.headers || {});
  const apiKey = options.useAnon ? config.anonKey : config.serviceKey;
  headers.set('apikey', apiKey);
  // Supabase's opaque sb_publishable_/sb_secret_ keys belong in apikey only.
  // Legacy JWT keys still require a Bearer header; user-scoped requests use the user's access token.
  const bearer = options.accessToken || (apiKey.startsWith('sb_') ? '' : apiKey);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  else headers.delete('authorization');
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${config.url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!response.ok) {
    const error = new Error(`supabase_http_${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return { data, response };
}

export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export function bearerToken(request) {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function authenticateAdmin(request, env) {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, error: 'authentication_required' };
  let config;
  try { config = await getSupabaseConfig(env); }
  catch { return { ok: false, status: 503, error: 'secure_config_unavailable' }; }
  if (!config) return { ok: false, status: 503, error: 'supabase_not_configured' };

  let authUser;
  try {
    const auth = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}` }
    });
    if (!auth.ok) return { ok: false, status: 401, error: 'invalid_session' };
    authUser = await auth.json();
  } catch {
    return { ok: false, status: 503, error: 'auth_service_unavailable' };
  }
  if (!authUser?.id) return { ok: false, status: 401, error: 'invalid_session' };

  try {
    const profile = await supabaseRequest(env,
      `/rest/v1/admin_profiles?user_id=eq.${encodeURIComponent(authUser.id)}&select=user_id,display_name,role,is_active&limit=1`
    );
    const row = Array.isArray(profile.data) ? profile.data[0] : null;
    if (!row || row.is_active !== true || !['owner', 'admin'].includes(row.role)) {
      return { ok: false, status: 403, error: 'admin_access_required' };
    }
    return { ok: true, user: { id: authUser.id, email: authUser.email || null }, profile: row, token };
  } catch {
    return { ok: false, status: 503, error: 'admin_verification_failed' };
  }
}

export function safeText(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}
