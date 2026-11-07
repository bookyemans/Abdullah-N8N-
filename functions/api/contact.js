import { getSupabaseConfig, supabaseRequest, json, isSameOrigin, safeText } from './_lib/supabase.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value, max) { return safeText(value, max).replace(/[<>]/g, ''); }
function validRef(value) { return UUID_RE.test(String(value || '')); }

async function verifyTurnstile(token, secret, remoteIp) {
  if (!secret) return true;
  if (!token) return false;
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const result = await response.json();
    return response.ok && result.success === true;
  } catch { return false; }
}

async function sendNotification(env, lead) {
  const key = env.WEB3FORMS_ACCESS_KEY;
  if (!key) return { status: 'not_configured', error: null };
  try {
    const form = new FormData();
    form.set('access_key', key);
    form.set('subject', `طلب تواصل جديد: ${lead.service || 'استفسار عام'}`);
    form.set('from_name', 'A5 Website');
    form.set('name', lead.name);
    form.set('email', lead.email);
    form.set('phone', lead.phone || 'غير مذكور');
    form.set('company', lead.company || 'غير مذكور');
    form.set('service', lead.service || 'غير محدد');
    form.set('budget', lead.budget || 'غير محددة');
    form.set('source', lead.referral_source || 'غير محدد');
    form.set('message', lead.message);
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST', headers: { Accept: 'application/json' }, body: form
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success === true) return { status: 'sent', error: null };
    return { status: 'failed', error: `web3forms_http_${response.status}` };
  } catch { return { status: 'failed', error: 'notification_provider_unavailable' }; }
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'origin_not_allowed' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ ok: false, error: 'json_required' }, 415);
  if (!(await getSupabaseConfig(env))) return json({ ok: false, error: 'contact_service_unavailable' }, 503);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 10000) return json({ ok: false, error: 'payload_too_large' }, 413);
  const raw = await request.text();
  if (raw.length > 10000) return json({ ok: false, error: 'payload_too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  // Honeypot: silently accept bots without creating a lead.
  if (clean(body?.website, 200)) return json({ ok: true, accepted: true, spam: true });
  const turnstileOk = await verifyTurnstile(
    clean(body?.turnstileToken, 2048), env.TURNSTILE_SECRET_KEY,
    request.headers.get('CF-Connecting-IP') || ''
  );
  if (!turnstileOk) return json({ ok: false, error: 'human_verification_failed' }, 400);

  const lead = {
    name: clean(body?.name, 120),
    email: clean(body?.email, 254).toLowerCase(),
    phone: clean(body?.phone, 40) || null,
    company: clean(body?.company, 160) || null,
    service: clean(body?.service, 160),
    budget: clean(body?.budget, 100) || null,
    referral_source: clean(body?.referralSource, 120) || null,
    message: clean(body?.message, 4000),
    source_page: clean(body?.sourcePage || '/contact.html', 300) || '/contact.html'
  };
  if (lead.name.length < 2 || !EMAIL_RE.test(lead.email) || lead.service.length < 2 || lead.message.length < 10) {
    return json({ ok: false, error: 'required_fields_invalid' }, 400);
  }
  const submissionRef = validRef(body?.submissionRef) ? body.submissionRef : crypto.randomUUID();
  const visitorKey = clean(body?.visitorKey, 160);
  const sessionKey = clean(body?.sessionKey, 160);

  try {
    let visitorId = null;
    let sessionId = null;
    if (visitorKey.length >= 12) {
      const visitor = await supabaseRequest(env, `/rest/v1/visitors?visitor_key=eq.${encodeURIComponent(visitorKey)}&select=id&limit=1`);
      visitorId = visitor.data?.[0]?.id || null;
    }
    if (sessionKey.length >= 12) {
      const session = await supabaseRequest(env, `/rest/v1/visitor_sessions?session_key=eq.${encodeURIComponent(sessionKey)}&select=id,visitor_id&limit=1`);
      if (session.data?.[0] && (!visitorId || session.data[0].visitor_id === visitorId)) sessionId = session.data[0].id;
    }

    const record = {
      submission_ref: submissionRef, status: 'new', source_page: lead.source_page,
      visitor_id: visitorId, session_id: sessionId,
      name: lead.name, email: lead.email, phone: lead.phone, message: lead.message,
      company: lead.company, service: lead.service, budget: lead.budget,
      referral_source: lead.referral_source, delivery_status: 'not_configured'
    };
    const inserted = await supabaseRequest(env, '/rest/v1/contact_submissions?on_conflict=submission_ref', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(record)
    });

    // Idempotent retries must not send duplicate notifications or create duplicate events.
    if (!inserted.data?.length) {
      const existing = await supabaseRequest(env, `/rest/v1/contact_submissions?submission_ref=eq.${encodeURIComponent(submissionRef)}&select=id&limit=1`);
      if (existing.data?.length) return json({ ok: true, accepted: true, submissionRef, duplicate: true });
      throw new Error('lead_insert_not_confirmed');
    }

    // The CRM insert is the primary success condition. Analytics and email are
    // secondary side effects and must never turn a stored lead into a failed form.
    let trackingRecorded = true;
    try {
      const eventId = `contact_${submissionRef}`;
      await supabaseRequest(env, '/rest/v1/tracking_events?on_conflict=event_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          event_id: eventId, visitor_id: visitorId, session_id: sessionId,
          event_type: 'contact_submit', page_path: lead.source_page,
          source: lead.referral_source, properties: { submission_ref: submissionRef, service: lead.service }
        })
      });
    } catch { trackingRecorded = false; }

    const delivery = await sendNotification(env, lead);
    try {
      await supabaseRequest(env, `/rest/v1/contact_submissions?submission_ref=eq.${encodeURIComponent(submissionRef)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ delivery_status: delivery.status, delivery_error: delivery.error, ...(delivery.status === 'sent' ? { notification_sent_at: new Date().toISOString() } : {}) })
      });
    } catch { /* The lead itself is already safely stored. */ }
    return json({ ok: true, accepted: true, submissionRef, notification: delivery.status, trackingRecorded });
  } catch {
    return json({ ok: false, error: 'lead_storage_failed' }, 503);
  }
}
