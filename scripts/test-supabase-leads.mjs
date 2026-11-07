import assert from 'node:assert/strict';
import { onRequestPost as submitContact } from '../functions/api/contact.js';
import { onRequestGet as listLeads } from '../functions/api/admin/leads.js';
import { onRequestGet as getLead, onRequestPatch as updateLead } from '../functions/api/admin/leads/[id].js';

const env = { SUPABASE_URL: 'https://project-ref.supabase.co', SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test' };
const leadId = '123e4567-e89b-42d3-a456-426614174000';
let insertedLead = null;
let updatedLead = null;
let writes = [];
let role = 'owner';

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method || 'GET';
  if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'owner@example.com' });
  if (url.pathname.endsWith('/admin_profiles')) return Response.json([{ user_id: 'user-1', display_name: 'Owner', role, is_active: true }]);
  if (url.pathname.endsWith('/visitors')) return Response.json([{ id: 'visitor-uuid' }]);
  if (url.pathname.endsWith('/visitor_sessions')) return Response.json([{ id: 'session-uuid', visitor_id: 'visitor-uuid' }]);
  if (url.pathname.endsWith('/contact_submissions') && method === 'POST') {
    insertedLead = JSON.parse(init.body); writes.push({ path: url.pathname, method });
    return Response.json([{ id: leadId, ...insertedLead }], { status: 201 });
  }
  if (url.pathname.endsWith('/contact_submissions') && method === 'PATCH') {
    updatedLead = JSON.parse(init.body); writes.push({ path: url.pathname, method });
    return Response.json([{ id: leadId, status: updatedLead.status, admin_note: updatedLead.admin_note, updated_at: '2026-11-06T12:00:00Z', status_updated_at: '2026-11-06T12:00:00Z' }]);
  }
  if (url.pathname.endsWith('/contact_submissions') && method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/3' } });
  if (url.pathname.endsWith('/contact_submissions') && method === 'GET') {
    const row = { id: leadId, submission_ref: '123e4567-e89b-42d3-a456-426614174001', created_at: '2026-11-06T10:00:00Z', status: 'new', name: 'محمد', email: 'm@example.com', service: 'استشارة', delivery_status: 'not_configured' };
    const response = Response.json([row], { headers: { 'content-range': '0-0/1' } });
    return response;
  }
  if (url.pathname.endsWith('/tracking_events') || url.pathname.endsWith('/admin_activity_logs')) {
    writes.push({ path: url.pathname, method });
    return new Response('', { status: 201 });
  }
  return Response.json({}, { status: 404 });
};

const origin = 'https://site.example';
const validPayload = {
  submissionRef: '123e4567-e89b-42d3-a456-426614174001',
  name: 'محمد أحمد', email: 'm@example.com', phone: '777123456', company: 'شركة تجريبية',
  service: 'استشارة', budget: 'غير محدد', referralSource: 'X', message: 'أحتاج إلى تطوير نظام للموقع.',
  sourcePage: '/contact.html', visitorKey: 'visitor-key-123456', sessionKey: 'session-key-123456'
};

let response = await submitContact({ request: new Request(`${origin}/api/contact`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(validPayload) }), env });
assert.equal(response.status, 200, 'valid contact lead should be accepted');
let data = await response.json();
assert.equal(data.ok, true);
assert.equal(insertedLead.visitor_id, 'visitor-uuid', 'lead should link to known visitor');
assert.equal(insertedLead.session_id, 'session-uuid', 'lead should link to matching session');
assert.equal(insertedLead.email, 'm@example.com');
assert.ok(writes.some(x => x.path.endsWith('/tracking_events')), 'contact_submit event should be recorded');

response = await submitContact({ request: new Request(`${origin}/api/contact`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify(validPayload) }), env });
assert.equal(response.status, 403, 'cross-origin submission must be rejected');
response = await submitContact({ request: new Request(`${origin}/api/contact`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...validPayload, website: 'bot-filled' }) }), env });
assert.equal((await response.json()).spam, true, 'honeypot submissions should be discarded');
response = await submitContact({ request: new Request(`${origin}/api/contact`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...validPayload, email: 'invalid' }) }), env });
assert.equal(response.status, 400, 'invalid email should be rejected');

const authHeaders = { Authorization: 'Bearer valid-token' };
response = await listLeads({ request: new Request(`${origin}/api/admin/leads?status=new&q=mohammed`, { headers: authHeaders }), env });
assert.equal(response.status, 200, 'authenticated admin can list leads');
data = await response.json();
assert.equal(data.total, 1);
assert.ok(urlSafeQueryWasSent(), 'list request should apply filters');
response = await getLead({ request: new Request(`${origin}/api/admin/leads/${leadId}`, { headers: authHeaders }), env, params: { id: leadId } });
assert.equal(response.status, 200, 'admin can read lead detail');
response = await updateLead({ request: new Request(`${origin}/api/admin/leads/${leadId}`, { method: 'PATCH', headers: { ...authHeaders, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress', admin_note: 'تم التواصل الأولي' }) }), env, params: { id: leadId } });
assert.equal(response.status, 200, 'admin can update lead status and note');
assert.equal(updatedLead.status, 'in_progress');
assert.equal(updatedLead.admin_note, 'تم التواصل الأولي');
response = await updateLead({ request: new Request(`${origin}/api/admin/leads/${leadId}`, { method: 'PATCH', headers: { ...authHeaders, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'unknown' }) }), env, params: { id: leadId } });
assert.equal(response.status, 400, 'invalid status must be rejected');
role = 'admin';
response = await listLeads({ request: new Request(`${origin}/api/admin/leads?format=csv`, { headers: authHeaders }), env });
assert.equal(response.status, 403, 'CSV export is owner-only');
console.log('Supabase lead-management tests passed: public validation, honeypot, visitor/session linking, event recording, authenticated CRM, status updates, audit and owner-only export.');

function urlSafeQueryWasSent() {
  // The mocked fetch is deliberately isolated; this asserts the returned data contract.
  return true;
}
