/**
 * Rebuild the static HTML shell from checked-in component source files.
 * Static markup is emitted into each page, so Cloudflare Pages needs no
 * runtime include support and navigation remains available without JS.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pages = ['index', 'about', 'services', 'projects', 'blog', 'contact'];
const tags = ['header', 'footer'];
let changed = 0;

for (const page of pages) {
  const htmlPath = path.join(root, `${page}.html`);
  let html = fs.readFileSync(htmlPath, 'utf8');
  for (const tag of tags) {
    const componentPath = path.join(root, 'shared', 'components', `${page}-${tag}.html`);
    const component = fs.readFileSync(componentPath, 'utf8').trim();
    const start = `<!-- SHARED COMPONENT: ${page.toUpperCase()}_${tag.toUpperCase()} START -->`;
    const end = `<!-- SHARED COMPONENT: ${page.toUpperCase()}_${tag.toUpperCase()} END -->`;
    const startAt = html.indexOf(start);
    const endAt = html.indexOf(end);
    if (startAt < 0 || endAt < 0 || endAt <= startAt) {
      throw new Error(`Missing or invalid component markers: ${page}.${tag}`);
    }
    const contentStart = startAt + start.length;
    const replacement = `\n${component}\n`;
    html = html.slice(0, contentStart) + replacement + html.slice(endAt);
  }
  fs.writeFileSync(htmlPath, html);
  changed++;
}
console.log(`Built shared static components for ${changed} pages (${changed * tags.length} components).`);
