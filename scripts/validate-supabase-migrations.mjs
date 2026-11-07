import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(f)).sort();
const errors = [];
const seen = new Set();
let previous = 0;
for (const file of files) {
  const number = Number(file.slice(0, 4));
  if (number !== previous + 1) errors.push(`${file}: migration numbering must be contiguous; expected ${String(previous + 1).padStart(4, '0')}`);
  previous = number;
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  const trimmed = sql.trim();
  if (!/\bbegin\s*;/i.test(trimmed)) errors.push(`${file}: missing explicit BEGIN transaction`);
  if (!/commit\s*;\s*$/i.test(trimmed)) errors.push(`${file}: missing terminal COMMIT`);
  if (/\b(drop\s+schema|drop\s+database|truncate\s+.+cascade)\b/i.test(sql)) errors.push(`${file}: destructive DDL requires manual approval`);
  if (/service_role|supabase_service_role_key|telegram_bot_token/i.test(sql)) errors.push(`${file}: secret-like value found in migration`);
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/ig)) seen.add(match[1].toLowerCase());
}
if (!files.length) errors.push('No numbered Supabase migrations found.');
if (files.some((f) => f.startsWith('0007_')) && !fs.readFileSync(path.join(dir, files.find((f) => f.startsWith('0007_'))), 'utf8').includes('admin_profiles')) errors.push('Admin hardening migration should target admin_profiles.');
if (errors.length) {
  console.error('Migration validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Migration packaging checks passed: ${files.length} sequential, transaction-wrapped SQL files.`);
console.log('This validates packaging conventions only; it does not parse or execute PostgreSQL SQL.');
