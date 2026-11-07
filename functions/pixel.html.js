import { getSupabaseConfig, getPrivateConfig, supabaseRequest } from './api/_lib/supabase.js';

const PIXEL_GIF = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}
async function hmacSha256(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const rid = (url.searchParams.get('rid') || '').trim().slice(0, 500);
  const legacyEmail = (url.searchParams.get('u') || '').trim().toLowerCase();
  const messageId = (url.searchParams.get('mid') || url.searchParams.get('message_id') || '').slice(0, 160);
  const campaign = (url.searchParams.get('campaign') || url.searchParams.get('c') || '').slice(0, 160);
  const subject = (url.searchParams.get('subject') || url.searchParams.get('sub') || '').slice(0, 240);
  let recipientHash = '';
  if (rid) recipientHash = await sha256(`rid:${rid}`);
  else if (legacyEmail && env.TRACKING_HASH_SECRET && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legacyEmail)) recipientHash = await hmacSha256(`email:${legacyEmail}`, env.TRACKING_HASH_SECRET);

  if ((await getSupabaseConfig(env)) && recipientHash && messageId) {
    try {
      const trackingSettings = await supabaseRequest(env, '/rest/v1/site_settings?key=eq.tracking&select=value&limit=1');
      if (trackingSettings.data?.[0]?.value?.enabled === false) {
        return new Response(PIXEL_GIF, { headers: { 'content-type': 'image/gif', 'content-length': String(PIXEL_GIF.length), 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', 'x-content-type-options': 'nosniff' } });
      }
      const cf = request.cf || {};
      const event = {
        recipient_hash: recipientHash, campaign, message_id: messageId, subject,
        country: String(cf.country || '-').slice(0, 8), city: String(cf.city || '-').slice(0, 100),
        user_agent: String(request.headers.get('user-agent') || '').slice(0, 500), requested_at: new Date().toISOString()
      };
      await supabaseRequest(env, '/rest/v1/email_open_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(event) });
      const integration = await supabaseRequest(env, '/rest/v1/integration_settings?provider=eq.google_sheets&select=enabled&limit=1');
      const dbSheetsEnabled = integration.data?.[0]?.enabled === true;
      const privateConfig = await getPrivateConfig(env);
      const sheets = privateConfig.google_sheets || {};
      if (dbSheetsEnabled && sheets.enabled && sheets.appsScriptUrl) {
        try { await fetch(sheets.appsScriptUrl, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ type: 'email_open_request', recipientHash, campaign, messageId, subject, country: cf.country || '-', city: cf.city || '-', requestedAt: event.requested_at, spreadsheetId: sheets.spreadsheetId || '' }) }); } catch { /* optional mirror */ }
      }
    } catch (error) { console.error('email_pixel_storage_failed', error?.message || 'unknown'); }
  }
  return new Response(PIXEL_GIF, { headers: {
    'content-type': 'image/gif', 'content-length': String(PIXEL_GIF.length),
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', pragma: 'no-cache', expires: '0', 'x-content-type-options': 'nosniff'
  }});
}
