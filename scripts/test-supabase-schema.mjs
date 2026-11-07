import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const files = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
const expectedMigrations = [
  '0001_core_schema.sql', '0002_analytics_views.sql', '0003_analytics_rpc.sql',
  '0004_lead_management.sql', '0005_conversion_analytics.sql', '0006_security_hardening.sql',
  '0007_admin_bootstrap_hardening.sql'
];
const sql = files.map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8')).join('\n');
const requiredTables = [
  'visitors', 'visitor_sessions', 'tracking_events', 'contact_submissions',
  'email_open_events', 'site_settings', 'integration_settings',
  'admin_profiles', 'admin_activity_logs', 'export_jobs'
];
const requiredEvents = ['page_view', 'session_start', 'session_end', 'cta_click', 'whatsapp_click', 'contact_submit', 'download'];
const failures = [];
if (JSON.stringify(files) !== JSON.stringify(expectedMigrations)) failures.push(`Migration sequence mismatch: expected ${expectedMigrations.join(', ')}, found ${files.join(', ')}`);
if (fs.existsSync(path.join(root, 'migrations'))) failures.push('Legacy root migrations directory exists; Supabase must be the sole database migration source.');

for (const table of requiredTables) {
  if (!new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(sql)) failures.push(`Missing table: ${table}`);
  if (!new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(sql)) failures.push(`RLS not enabled: ${table}`);
}
for (const event of requiredEvents) {
  if (!sql.includes(`'${event}'`)) failures.push(`Missing event type: ${event}`);
}
for (const token of ['unique', 'is_active_admin', 'is_owner', 'security_invoker = true', "('google_sheets', false", "('telegram', false"]) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) failures.push(`Missing security/schema feature: ${token}`);
}
for (const column of ['company text', 'service text', 'budget text', 'referral_source text', 'admin_note text', 'delivery_status text']) {
  if (!sql.toLowerCase().includes(column.toLowerCase())) failures.push(`Missing lead-management column: ${column}`);
}
if (!sql.includes('contact_submissions_delivery_status_check')) failures.push('Missing delivery status constraint.');
for (const token of ['admin_conversion_summary', 'conversion_rate', 'lead_rate', 'lead_sources', 'visitor_sources']) { if (!sql.toLowerCase().includes(token.toLowerCase())) failures.push(`Missing conversion analytics feature: ${token}`); }
if (/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(sql)) failures.push('A service-role secret must never appear in SQL migrations.');
if (/create policy[^;]+to anon/i.test(sql)) failures.push('Unexpected anonymous policy found.');
if (!/revoke all on public\.visitors[\s\S]*?from anon, authenticated/i.test(sql)) failures.push('Missing explicit anon/authenticated privilege revocation.');
if (!/revoke all on all sequences in schema public from anon, authenticated/i.test(sql)) failures.push('Missing sequence privilege revocation.');
for (const fn of ['set_updated_at', 'touch_contact_submission']) {
  if (!new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`, 'i').test(sql)) failures.push(`Trigger function is not explicitly locked down: ${fn}`);
}
if (!/revoke insert, update, delete, truncate, references, trigger[\s\S]*?from anon, authenticated/i.test(sql)) failures.push('Missing explicit write privilege hardening.');
if (/create policy[^;]+for\s+(insert|update|delete|all)[^;]+on public\.admin_profiles/i.test(sql)) failures.push('Admin profile write policy detected; role escalation must remain server-controlled.');

if (failures.length) {
  console.error('Supabase schema checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Supabase schema static checks passed (${files.length} migrations, ${requiredTables.length} RLS tables, ${requiredEvents.length} event types).`);
console.log('Note: this is a static repository check, not a live PostgreSQL/RLS integration test.');
