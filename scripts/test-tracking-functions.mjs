import assert from 'node:assert/strict';
import { onRequestPost as trackPost } from '../functions/api/track.js';
import { onRequestGet as pixelGet } from '../functions/pixel.html.js';
import { onRequestGet as geoGet } from '../functions/api/geo.js';

const env = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test-key'
};
const calls = [];
let eventRows = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: url.toString(), method, body });
  if (url.pathname.endsWith('/site_settings') && method === 'GET') return Response.json([{ key: 'tracking', value: { enabled: true, pageviews: true, clicks: true } }]);
  if (url.pathname.endsWith('/integration_settings') && method === 'GET') return Response.json([{ provider: 'google_sheets', enabled: false }]);
  if (url.pathname.endsWith('/visitors') && method === 'GET') return Response.json([]);
  if (url.pathname.endsWith('/visitors') && method === 'POST') return Response.json([{ id: 'visitor-uuid-1' }], { status: 201 });
  if (url.pathname.endsWith('/visitor_sessions') && method === 'GET') return Response.json([]);
  if (url.pathname.endsWith('/visitor_sessions') && method === 'POST') return Response.json([{ id: 'session-uuid-1' }], { status: 201 });
  if (url.pathname.endsWith('/tracking_events') && method === 'POST') {
    if (eventRows.some(row => row.event_id === body.event_id)) return Response.json([]);
    eventRows.push(body); return Response.json([body], { status: 201 });
  }
  if (url.pathname.endsWith('/email_open_events') && method === 'POST') return new Response('', { status: 201 });
  if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: 'user-uuid-1', email: 'owner@example.com' });
  if (url.pathname.endsWith('/admin_profiles')) return Response.json([{ user_id: 'user-uuid-1', display_name: 'Owner', role: 'owner', is_active: true }]);
  return Response.json({ message: `unmocked ${method} ${url.pathname}` }, { status: 404 });
};

const payload = { type: 'visit', eventId: 'event-id-0001', visitorId: 'visitor-key-000001', sessionId: 'session-key-000001', page: '/services.html', user: 'private@example.com', campaign: 'spring', timestamp: '2026-11-06T10:00:00.000Z' };
let response = await trackPost({ request: new Request('https://site.example/api/track', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env });
assert.equal(response.status, 403, 'reject cross-origin writes');
response = await trackPost({ request: new Request('https://site.example/api/track', { method: 'POST', headers: { Origin: 'https://site.example', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env });
assert.equal(response.status, 200, 'persist event in Supabase');
assert.equal((await response.json()).inserted, true);
assert.equal(eventRows.length, 1);
assert.equal(JSON.stringify(eventRows[0]).includes('private@example.com'), false, 'raw email must not be persisted');
assert.equal(eventRows[0].event_type, 'page_view');

response = await pixelGet({ request: new Request('https://site.example/pixel.html?rid=opaque-123&mid=m-1&campaign=c-1'), env });
assert.equal(response.headers.get('content-type'), 'image/gif');
assert.equal(response.status, 200);
assert.ok(calls.some(call => call.url.includes('/email_open_events')));

response = await geoGet({ request: new Request('https://site.example/api/geo'), env: {}, data: {} });
assert.equal(response.status, 200);
assert.equal((await response.json()).country, '-');
console.log('Tracking tests passed: origin validation, Supabase visitor/session/event writes, PII omission, email pixel, geo fallback.');
