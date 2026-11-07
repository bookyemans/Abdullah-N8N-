import assert from 'node:assert/strict';
import { onRequestGet as adminMe } from '../functions/api/admin/me.js';
import { onRequestGet as adminVisitors } from '../functions/api/admin/visitors.js';
import { onRequestPut as updateSetting } from '../functions/api/admin/settings.js';

const env = { SUPABASE_URL: 'https://project-ref.supabase.co', SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test' };
let profileRole = 'owner';
let allowAuth = true;
const writes = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method || 'GET';
  if (url.pathname.endsWith('/auth/v1/user')) return allowAuth ? Response.json({ id: 'user-1', email: 'owner@example.com' }) : Response.json({}, { status: 401 });
  if (url.pathname.endsWith('/admin_profiles')) return Response.json([{ user_id: 'user-1', display_name: 'Owner', role: profileRole, is_active: true }]);
  if (url.pathname.endsWith('/visitors')) return Response.json([{ id: 'v1', visitor_key: 'visitor-key-123456', first_seen_at: '2026-11-01T00:00:00Z', last_seen_at: '2026-11-06T00:00:00Z' }]);
  if (url.pathname.endsWith('/site_settings') || url.pathname.endsWith('/integration_settings') || url.pathname.endsWith('/admin_activity_logs')) { writes.push({ path: url.pathname, body: init.body }); return new Response('', { status: 201 }); }
  return Response.json({}, { status: 404 });
};

let response = await adminMe({ request: new Request('https://site.example/api/admin/me'), env });
assert.equal(response.status, 401, 'missing bearer token must be rejected');
response = await adminMe({ request: new Request('https://site.example/api/admin/me', { headers: { Authorization: 'Bearer valid-token' } }), env });
assert.equal(response.status, 200, 'active admin should authenticate');
response = await adminVisitors({ request: new Request('https://site.example/api/admin/visitors?limit=500'), env });
assert.equal(response.status, 401, 'visitors API requires authentication');
response = await adminVisitors({ request: new Request('https://site.example/api/admin/visitors?limit=500', { headers: { Authorization: 'Bearer valid-token' } }), env });
assert.equal(response.status, 200);
const visitorData = await response.json();
assert.equal(visitorData.limit, 100, 'page size is capped');
assert.ok(visitorData.visitors[0].visitor_key.includes('…'), 'visitor key is masked');

profileRole = 'admin';
response = await updateSetting({ request: new Request('https://site.example/api/admin/settings', { method: 'PUT', headers: { Origin: 'https://site.example', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'tracking.enabled', value: true }) }), env });
assert.equal(response.status, 403, 'non-owner cannot update settings');
profileRole = 'owner';
response = await updateSetting({ request: new Request('https://site.example/api/admin/settings', { method: 'PUT', headers: { Origin: 'https://site.example', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'tracking.enabled', value: true }) }), env });
assert.equal(response.status, 200, 'owner can update settings');
assert.equal(writes.length, 2, 'setting change and audit log are written');
response = await updateSetting({ request: new Request('https://site.example/api/admin/settings', { method: 'PUT', headers: { Origin: 'https://site.example', Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google_sheets', enabled: false, options: {} }) }), env });
assert.equal(response.status, 200, 'owner can update optional integrations');
console.log('Supabase admin API tests passed: authentication, role checks, visitor pagination/masking, owner-only settings writes.');
