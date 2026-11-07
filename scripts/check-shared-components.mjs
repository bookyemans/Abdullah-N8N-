import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const pages = ['index', 'about', 'services', 'projects', 'blog', 'contact'];
let checked = 0;
for (const page of pages) {
  const html = fs.readFileSync(`${page}.html`, 'utf8');
  for (const tag of ['header', 'footer']) {
    const start = `<!-- SHARED COMPONENT: ${page.toUpperCase()}_${tag.toUpperCase()} START -->`;
    const end = `<!-- SHARED COMPONENT: ${page.toUpperCase()}_${tag.toUpperCase()} END -->`;
    const a = html.indexOf(start), b = html.indexOf(end);
    assert(a >= 0 && b > a, `${page}: missing ${tag} markers`);
    const component = html.slice(a + start.length, b).trim();
    assert(component.startsWith(`<${tag}`), `${page}: ${tag} opening tag missing`);
    assert(component.endsWith(`</${tag}>`), `${page}: ${tag} closing tag missing`);
    const source = fs.readFileSync(path.join('shared','components',`${page}-${tag}.html`),'utf8').trim();
    assert.equal(component, source, `${page}: ${tag} differs from canonical component`);
    checked++;
  }
}
console.log(`Shared component check passed: ${checked} components across ${pages.length} pages.`);
