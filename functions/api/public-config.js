import { json, getSupabaseConfig } from './_lib/supabase.js';

// Publish only the project URL and public/anon key. Service role is never returned.
export async function onRequestGet({ env }) {
  const config = await getSupabaseConfig(env);
  if (!config) return json({ ok: false, error: 'supabase_public_config_missing' }, 503);
  return json({ ok: true, supabaseUrl: config.url, anonKey: config.anonKey }, 200, { 'cache-control': 'no-store' });
}
