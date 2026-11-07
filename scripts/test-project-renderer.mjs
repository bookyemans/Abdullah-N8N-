import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../projects.html', import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('../data/projects.json', import.meta.url),'utf8'));
assert.match(html,/fetch\('data\/projects\.json'/);
assert.match(html,/function renderProjects\(projects\)/);
assert.match(html,/projectDetails = Object\.fromEntries/);
assert.equal(catalog.projects.filter(p=>p.status==='published').length,12);
assert.equal(new Set(catalog.projects.map(p=>p.id)).size,catalog.projects.length);
for (const p of catalog.projects.filter(p=>p.status==='published')) {
  assert.ok(p.title && p.category && p.detailPage && p.image, `Required fields missing: ${p.id}`);
}
console.log('Project renderer static integration checks passed.');
