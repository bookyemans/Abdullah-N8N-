import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (path.relative(root, path.join(dir, entry.name)).replaceAll(path.sep, '/').startsWith('shared/components/')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) htmlFiles.push(full);
  }
}
walk(root);
const failures = [];
let imageCount = 0;
let lazyCount = 0;
let eagerCount = 0;
let reducedMotionPages = 0;
let focusPages = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (/\bsrc\s*=\s*["']\s*["']/i.test(tag)) continue;
    imageCount++;
    if (!/\bloading\s*=\s*["'](?:lazy|eager)["']/i.test(tag)) failures.push(`${rel}: img without loading hint: ${tag.slice(0, 100)}`);
    if (!/\bdecoding\s*=\s*["']async["']/i.test(tag)) failures.push(`${rel}: img without async decoding hint: ${tag.slice(0, 100)}`);
    if (/\bloading\s*=\s*["']lazy["']/i.test(tag)) lazyCount++;
    if (/\bloading\s*=\s*["']eager["']/i.test(tag)) eagerCount++;
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src && !/^(?:https?:|data:|#|\$\{)/i.test(src)) {
      const local = path.resolve(path.dirname(file), src.split(/[?#]/)[0]);
      if (!fs.existsSync(local)) failures.push(`${rel}: image source missing: ${src}`);
    }
  }
  if (html.includes('prefers-reduced-motion')) reducedMotionPages++;
  if (html.includes(':focus-visible')) focusPages++;
}
for (const asset of ['image.webp', 'image2.webp']) {
  if (!fs.existsSync(path.join(root, asset))) failures.push(`Optimized image missing: ${asset}`);
}
console.log(`HTML pages: ${htmlFiles.length}`);
console.log(`Images checked: ${imageCount} (lazy=${lazyCount}, eager=${eagerCount})`);
console.log(`Reduced-motion support: ${reducedMotionPages}/${htmlFiles.length} pages`);
console.log(`Visible keyboard focus support: ${focusPages}/${htmlFiles.length} pages`);
if (failures.length) {
  console.error(`Performance checks failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Performance and accessibility checks passed.');
