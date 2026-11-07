import fs from 'node:fs';
import path from 'node:path';
const file = path.join(process.cwd(), 'data/blog-posts.json');
const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(catalog.posts) || catalog.posts.length === 0) throw new Error('Blog catalog must contain posts');
const ids = new Set();
const errors = [];
for (const post of catalog.posts) {
  if (!Number.isInteger(post.id) || ids.has(post.id)) errors.push(`Invalid or duplicate id: ${post.id}`);
  ids.add(post.id);
  for (const key of ['title', 'description', 'category', 'badge', 'date']) if (!String(post[key] ?? '').trim()) errors.push(`Post ${post.id}: missing ${key}`);
  if (post.available) {
    if (!post.href || !post.href.startsWith('blogs/')) errors.push(`Post ${post.id}: invalid href`);
    else if (!fs.existsSync(path.join(process.cwd(), post.href))) errors.push(`Post ${post.id}: missing file ${post.href}`);
  } else if (post.href) errors.push(`Post ${post.id}: unavailable post must not expose href`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Blog catalog valid: ${catalog.posts.length} posts, ${catalog.posts.filter(p => p.available).length} linked articles, ${catalog.posts.filter(p => !p.available).length} unavailable entries.`);
