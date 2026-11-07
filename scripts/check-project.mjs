import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'a3 2' || (dir === root && entry.name === 'shared')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}
await walk(root);
let failures = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const ref of refs) {
    if (!ref || /^(https?:|mailto:|tel:|#|data:|javascript:)/i.test(ref) || ref.includes('${')) continue;
    const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
    if (!clean || clean.startsWith('//')) continue;
    const target = clean.startsWith('/') ? path.resolve(root, '.' + clean) : path.resolve(path.dirname(file), clean);
    try { await access(target); } catch {
      console.error(`MISSING: ${path.relative(root, file)} -> ${ref}`);
      failures++;
    }
  }
}
console.log(`Scanned ${htmlFiles.length} HTML files; ${failures} missing local references.`);
if (failures) process.exitCode = 1;
