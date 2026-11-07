import assert from 'node:assert/strict';
import { getSupabaseConfig, supabaseRequest, supabaseApiKeyHeaders } from '../functions/api/_lib/supabase.js';

const modernEnv = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_public_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_server_key'
};
const modernConfig = await getSupabaseConfig(modernEnv);
assert.equal(modernConfig.anonKey, modernEnv.SUPABASE_PUBLISHABLE_KEY);
assert.equal(modernConfig.serviceKey, modernEnv.SUPABASE_SECRET_KEY);

const modernHeaders = supabaseApiKeyHeaders(modernEnv.SUPABASE_SECRET_KEY);
assert.equal(modernHeaders.get('apikey'), modernEnv.SUPABASE_SECRET_KEY);
assert.equal(modernHeaders.has('authorization'), false, 'opaque secret key must not be sent as Bearer');

const originalFetch = globalThis.fetch;
const seen = [];
globalThis.fetch = async (url, init = {}) => {
  seen.push({ url, headers: new Headers(init.headers || {}) });
  return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
};
try {
  await supabaseRequest(modernEnv, '/rest/v1/example');
  assert.equal(seen[0].headers.get('apikey'), modernEnv.SUPABASE_SECRET_KEY);
  assert.equal(seen[0].headers.has('authorization'), false);

  await supabaseRequest(modernEnv, '/rest/v1/rpc/example', { method: 'POST', useAnon: true, accessToken: 'user-session-jwt', body: '{}' });
  assert.equal(seen[1].headers.get('apikey'), modernEnv.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(seen[1].headers.get('authorization'), 'Bearer user-session-jwt');

  const legacyEnv = {
    SUPABASE_URL: 'https://project-ref.supabase.co',
    SUPABASE_ANON_KEY: 'legacy.anon.jwt',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy.service.jwt'
  };
  const legacyHeaders = supabaseApiKeyHeaders(legacyEnv.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(legacyHeaders.get('authorization'), `Bearer ${legacyEnv.SUPABASE_SERVICE_ROLE_KEY}`);
  await supabaseRequest(legacyEnv, '/rest/v1/example');
  assert.equal(seen[2].headers.get('authorization'), `Bearer ${legacyEnv.SUPABASE_SERVICE_ROLE_KEY}`);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase API key compatibility tests passed: publishable/secret opaque keys use apikey only; legacy JWT keys remain supported.');
