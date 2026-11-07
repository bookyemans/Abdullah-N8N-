import { authenticateAdmin, json } from '../_lib/supabase.js';
export async function onRequestGet({ request, env }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  return json({ ok: true, user: auth.user, profile: auth.profile });
}
