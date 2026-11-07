import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');
const failures = [];
const users = read('functions/api/admin/users.js');
const userId = read('functions/api/admin/users/[id].js');
const auth = read('functions/api/_lib/supabase.js');
const migration = read('supabase/migrations/0007_admin_bootstrap_hardening.sql');
for (const [label, ok] of [
  ['Invitation role is allow-listed', /!\['admin','owner'\]\.includes\(body\.role\)/.test(users)],
  ['Invitation request body has measured byte limit', /TextEncoder\(\)\.encode\(raw\)\.byteLength > 4000/.test(users)],
  ['Partial invitation provisioning has compensating cleanup', /auth\/v1\/admin\/users\//.test(users) && /admin_profiles\?user_id=eq/.test(users)],
  ['User update body has measured byte limit', /TextEncoder\(\)\.encode\(raw\)\.byteLength>4000/.test(userId)],
  ['Auth handles encrypted-config failures safely', /secure_config_unavailable/.test(auth)],
  ['Direct admin profile writes are revoked', /revoke insert, update, delete on public\.admin_profiles from anon, authenticated/i.test(migration)],
  ['Direct activity log writes are revoked', /revoke insert, update, delete on public\.admin_activity_logs from anon, authenticated/i.test(migration)],
]) if (!ok) failures.push(label);
if (failures.length) { console.error('Security checks failed:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('Security hardening checks passed (7 assertions).');
console.log('These are static checks; live Auth, PostgreSQL RLS and concurrency tests remain required.');
