const url = process.env.SUPABASE_URL?.trim();
const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const missing = [!url && 'SUPABASE_URL', !publishableKey && 'SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)', !secretKey && 'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)'].filter(Boolean);
if (missing.length) {
  console.error(`Live Supabase check cannot start. Missing: ${missing.join(', ')}`);
  console.error('Set secrets in your local shell or Cloudflare secret store. Never commit or paste server secrets into chat.');
  process.exit(2);
}
const base = url.replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)) {
  console.error('SUPABASE_URL must be a valid https://<project-ref>.supabase.co URL.');
  process.exit(2);
}
async function request(label, endpoint, key, { legacyBearer = false } = {}) {
  const headers = { apikey: key, Accept: 'application/json' };
  if (legacyBearer || !key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  try {
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
    await response.arrayBuffer();
    if (!response.ok) {
      console.error(`${label}: FAILED (HTTP ${response.status}). Response body omitted.`);
      return false;
    }
    console.log(`${label}: OK (HTTP ${response.status})`);
    return true;
  } catch {
    console.error(`${label}: NETWORK_ERROR`);
    return false;
  }
}
const authOk = await request('Supabase Auth public settings', `${base}/auth/v1/settings`, publishableKey);
const restOk = await request('Supabase REST server-key endpoint', `${base}/rest/v1/`, secretKey);
if (!authOk || !restOk) process.exit(1);
console.log('Connectivity only: this does NOT apply migrations, validate RLS policies, create an owner, or prove table-level permissions.');
