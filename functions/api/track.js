import { getSupabaseConfig, getPrivateConfig, supabaseRequest, json, isSameOrigin, safeText } from './_lib/supabase.js';

const ALLOWED_TYPES = new Set(['visit', 'visit_exit', 'page_view', 'session_start', 'session_end', 'cta_click', 'whatsapp_click', 'contact_submit', 'download', 'custom']);

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'origin_not_allowed' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'json_required' }, 415);
  if (!(await getSupabaseConfig(env))) return json({ ok: false, error: 'supabase_not_configured' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 12000) return json({ ok: false, error: 'payload_too_large' }, 413);
  const raw = await request.text();
  if (raw.length > 12000) return json({ ok: false, error: 'payload_too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const legacyType = safeText(body?.type, 40);
  if (!ALLOWED_TYPES.has(legacyType)) return json({ ok: false, error: 'invalid_event_type' }, 400);
  const eventId = safeText(body.eventId, 180);
  const visitorKey = safeText(body.visitorId, 160);
  const sessionKey = safeText(body.sessionId, 160);
  const page = safeText(body.page || body.page_path || '/', 500);
  if (eventId.length < 8 || visitorKey.length < 12 || sessionKey.length < 12 || !page.startsWith('/') || page.startsWith('//')) {
    return json({ ok: false, error: 'required_fields_invalid' }, 400);
  }

  const eventType = legacyType === 'visit' ? 'page_view' : legacyType === 'visit_exit' ? 'session_end' : legacyType;
  const occurredAt = isoDate(body.timestamp || body.occurred_at);
  const source = safeText(body.source, 160) || null;
  const campaign = safeText(body.campaign, 200) || null;
  const properties = {
    legacy_type: legacyType,
    page_name: safeText(body.pageName, 160),
    identify_method: safeText(body.identifyMethod, 80),
    is_new: Boolean(body.isNew),
    visit_count: Math.max(0, Math.min(1000000, Number(body.visitCount) || 0)),
    browse_path: safeText(body.browsePath, 1800),
    page_count: Math.max(0, Math.min(10000, Number(body.pageCount) || 0)),
    time_on_page: Math.max(0, Math.min(86400, Number(body.timeOnPage) || 0)),
    scroll_max: Math.max(0, Math.min(100, Number(body.scrollMax) || 0)),
    source_type: safeText(body.sourceType, 80),
    device_type: safeText(body.deviceType, 40),
    browser: safeText(body.browser, 60),
    country: safeText(body.country, 80)
  };

  try {
    // Read the owner-controlled tracking switches from Supabase. If the settings
    // row is absent, keep the safe default: tracking remains enabled.
    const settingResult = await supabaseRequest(env, '/rest/v1/site_settings?key=eq.tracking&select=value&limit=1');
    const trackingConfig = settingResult.data?.[0]?.value || {};
    if (trackingConfig.enabled === false) return json({ ok: true, skipped: true, reason: 'tracking_disabled' });
    if ((trackingConfig.track_page_views === false || trackingConfig.pageviews === false) && ['page_view', 'visit'].includes(legacyType)) return json({ ok: true, skipped: true, reason: 'pageviews_disabled' });
    if ((trackingConfig.track_clicks === false || trackingConfig.clicks === false) && ['cta_click', 'whatsapp_click', 'download'].includes(legacyType)) return json({ ok: true, skipped: true, reason: 'click_tracking_disabled' });

    const visitorCreate = await supabaseRequest(env, '/rest/v1/visitors?on_conflict=visitor_key&select=id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ visitor_key: visitorKey, first_seen_at: occurredAt, last_seen_at: occurredAt, first_source: source, last_source: source, first_landing_path: page, last_landing_path: page })
    });
    let visitorRow = visitorCreate.data?.[0];
    if (!visitorRow?.id) {
      const existingVisitor = await supabaseRequest(env, `/rest/v1/visitors?visitor_key=eq.${encodeURIComponent(visitorKey)}&select=id&limit=1`);
      const visitorId = existingVisitor.data?.[0]?.id;
      if (!visitorId) throw new Error('visitor_lookup_missing_id');
      const updated = await supabaseRequest(env, `/rest/v1/visitors?id=eq.${visitorId}&select=id`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ last_seen_at: occurredAt, last_source: source, last_landing_path: page })
      });
      visitorRow = updated.data?.[0];
    }
    if (!visitorRow?.id) throw new Error('visitor_write_missing_id');

    const sessionCreate = await supabaseRequest(env, '/rest/v1/visitor_sessions?on_conflict=session_key&select=id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ session_key: sessionKey, visitor_id: visitorRow.id, started_at: occurredAt, last_activity_at: occurredAt, landing_path: page, source, device_type: properties.device_type || null, browser: properties.browser || null, country: properties.country || null, utm_campaign: campaign, ...(eventType === 'session_end' ? { ended_at: occurredAt } : {}) })
    });
    let sessionRow = sessionCreate.data?.[0];
    if (!sessionRow?.id) {
      const existingSession = await supabaseRequest(env, `/rest/v1/visitor_sessions?session_key=eq.${encodeURIComponent(sessionKey)}&select=id&limit=1`);
      const sessionId = existingSession.data?.[0]?.id;
      if (!sessionId) throw new Error('session_lookup_missing_id');
      const patch = { last_activity_at: occurredAt, source, device_type: properties.device_type || null, browser: properties.browser || null, country: properties.country || null, utm_campaign: campaign };
      if (eventType === 'session_end') patch.ended_at = occurredAt;
      const updated = await supabaseRequest(env, `/rest/v1/visitor_sessions?id=eq.${sessionId}&select=id`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
      });
      sessionRow = updated.data?.[0];
    }
    if (!sessionRow?.id) throw new Error('session_write_missing_id');

    const inserted = await supabaseRequest(env, '/rest/v1/tracking_events?on_conflict=event_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        event_id: eventId, visitor_id: visitorRow.id, session_id: sessionRow.id,
        event_type: eventType, page_path: page, occurred_at: occurredAt,
        source, campaign, properties, is_admin: false
      })
    });

    let sheetsQueued = false;
    const sheetsConfig = await supabaseRequest(env, '/rest/v1/integration_settings?provider=eq.google_sheets&select=enabled&limit=1');
    const sheetsEnabled = sheetsConfig.data?.[0]?.enabled === true;
    const privateConfig = await getPrivateConfig(env);
    const sheets = privateConfig.google_sheets || {};
    if (inserted.data?.length && sheetsEnabled && sheets.enabled && sheets.appsScriptUrl) {
      try {
        const mirror = await fetch(sheets.appsScriptUrl, {
          method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ eventId, eventType, visitorId: visitorKey, sessionId: sessionKey, page, occurredAt, source, campaign, properties, spreadsheetId: sheets.spreadsheetId || '' })
        });
        sheetsQueued = mirror.ok;
      } catch { /* Supabase remains authoritative. */ }
    }
    return json({ ok: true, inserted: Boolean(inserted.data?.length), sheetsForwarded: sheetsQueued });
  } catch (error) {
    const status = error?.status === 400 ? 400 : 500;
    return json({ ok: false, error: status === 400 ? 'supabase_rejected_event' : 'tracking_storage_failed' }, status);
  }
}
