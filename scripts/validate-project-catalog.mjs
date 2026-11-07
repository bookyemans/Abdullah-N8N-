import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'data', 'projects.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const errors = [];
const ids = new Set();
if (catalog.schemaVersion !== 1) errors.push('Unsupported schemaVersion');
if (!Array.isArray(catalog.projects)) errors.push('projects must be an array');
for (const [index, project] of (catalog.projects || []).entries()) {
  const label = project.id || `item ${index + 1}`;
  for (const key of ['id', 'title', 'category', 'description', 'tags', 'detailPage', 'status']) {
    if (!(key in project)) errors.push(`${label}: missing ${key}`);
  }
  if (ids.has(project.id)) errors.push(`${label}: duplicate id`);
  ids.add(project.id);
  for (const field of ['image', 'detailPage', 'workflowFile']) {
    const value = project[field];
    if (!value) continue;
    if (/^(https?:|mailto:|#)/i.test(value) || value.startsWith('/')) continue;
    const resolved = path.resolve(root, value);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) errors.push(`${label}: missing or unsafe ${field}: ${value}`);
  }
  if (!['draft', 'published', 'archived'].includes(project.status)) errors.push(`${label}: invalid status`);
  if (!Array.isArray(project.tags) || !Array.isArray(project.pipeline) || !Array.isArray(project.metrics)) errors.push(`${label}: tags, pipeline and metrics must be arrays`);
}
if (errors.length) {
  console.error(`Project catalog validation failed (${errors.length} issue(s))`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Project catalog OK: ${catalog.projects.length} unique records; referenced local assets exist.`);
}
