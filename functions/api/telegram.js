import { getSupabaseConfig, getPrivateConfig, supabaseRequest } from './_lib/supabase.js';
const ALLOWED_KINDS = new Set(['visit', 'exit', 'email_open', 'form']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const requestUrl = new URL(request.url);
  // Accept same-origin browser requests only. Requests without Origin are rejected by design.
  try {
    if (!origin || new URL(origin).host !== requestUrl.host || new URL(origin).protocol !== requestUrl.protocol) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403);
    }
  } catch { return json({ ok: false, error: 'origin_not_allowed' }, 403); }

  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return json({ ok: false, error: 'json_required' }, 415);
  }

  const privateConfig = await getPrivateConfig(env);
  const telegramConfig = privateConfig.telegram || {};
  if (!telegramConfig.botToken || !telegramConfig.chatId || telegramConfig.enabled === false) {
    return json({ ok: false, error: 'service_not_configured' }, 503);
  }
  // When Supabase is configured, honor the owner-controlled integration switch.
  if (await getSupabaseConfig(env)) {
    try {
      const integration = await supabaseRequest(env, '/rest/v1/integration_settings?provider=eq.telegram&select=enabled&limit=1');
      if (integration.data?.[0]?.enabled === false) return json({ ok: true, skipped: true, reason: 'integration_disabled' });
    } catch { return json({ ok: false, error: 'integration_status_unavailable' }, 503); }
  }

  let payload;
  try { payload = await request.json(); }
  catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const kind = String(payload?.kind || '');
  const rawMessage = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!ALLOWED_KINDS.has(kind) || !rawMessage || rawMessage.length > 3900) {
    return json({ ok: false, error: 'invalid_payload' }, 400);
  }
  // Only allow the small formatting subset used by our own templates.
  const message = rawMessage.replace(/<(?!\/?(?:b|strong|i|em|code|pre)\b)[^>]*>/gi, '');

  const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramConfig.chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  if (!telegramResponse.ok) return json({ ok: false, error: 'telegram_delivery_failed' }, 502);
  const result = await telegramResponse.json();
  return result.ok ? json({ ok: true }) : json({ ok: false, error: 'telegram_rejected' }, 502);
}
