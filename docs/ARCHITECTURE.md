# Project Architecture

## Current deployment model
- Static frontend: HTML, CSS and browser JavaScript, served from the repository root by Cloudflare Pages.
- Server-side endpoints: `functions/` (Cloudflare Pages Functions).
- Public browser integrations: Web3Forms and the existing Google Apps Script endpoint. These are public endpoints, not secret storage.
- Private credentials: Cloudflare Pages environment secrets only. Never commit `.env`, `.dev.vars`, bot tokens, or private API keys.

## Existing page groups
- Root pages: `index.html`, `about.html`, `services.html`, `projects.html`, `blog.html`, `contact.html`, `pixel.html`.
- Article pages: `blogs/`.
- Project detail pages and project data: `Manager/`.
- Legacy/alternate tracker snapshots: `a3 2/` (preserved; do not deploy or delete until usage is confirmed).
- Shared browser scripts remain at the root for now because current HTML pages reference these paths.

## Change policy
1. Keep the root-level public URLs stable.
2. Do not move HTML or JS files until every inbound link and script reference is migrated and verified.
3. Treat `a3 2/` as an archive, not an active source of truth, until runtime usage is established.
4. Keep credentials out of browser JavaScript and Git history.
5. Test root pages, article pages, project pages, forms and Functions in a Cloudflare Preview deployment before production.

## Planned modularization
- First stabilize current script loading and configuration contracts.
- Then migrate repeated page markup into shared components only if a build step is introduced.
- Keep Pages Functions as the boundary for private integrations.
- Introduce D1 only when a concrete persistence requirement is defined; it is not required for static content today.
