# Supabase Phase 5 — Security Review and Hardening

## Implemented

- Hardened admin invitation input: explicit `admin`/`owner` allow-list, JSON content-type validation, and a measured 4 KB body limit (not relying only on Content-Length).
- Added compensating cleanup for partially completed admin invitations: if profile creation or audit logging fails after Auth invitation, the function attempts to delete the created profile and invited Auth user.
- Added a measured 4 KB request-body limit to admin profile updates.
- Made admin authentication return a controlled `503 secure_config_unavailable` when encrypted private configuration cannot be decrypted/read, rather than allowing a configuration exception to escape the handler.
- Added seven static security assertions to the normal `npm test` pipeline.
- Retained database restrictions from migrations 0006/0007: direct browser writes to privileged tables and admin profile/activity log are revoked; RLS remains enabled across the ten application tables.

## Verification performed

- `npm test` — PASS, including 7 new security assertions and existing Telegram, tracking, Supabase API, schema, analytics, leads, and conversion suites.
- `npm run check` — PASS: 41 HTML files, zero missing local references, catalogs, shared components, performance and accessibility checks.
- `node --check` across all Functions JavaScript files — PASS.

## Important limits / not performed

- No live Supabase project was available; no SQL migration was executed against PostgreSQL.
- No live Auth invitation/deletion, role transition, RLS identity matrix, or concurrent last-owner test was performed.
- Static checks do not prove database security. Before production, run the documented manual security acceptance matrix against a disposable Supabase project with anon, ordinary authenticated, admin, and owner identities.
- Invitation compensation is best-effort. If Supabase is unreachable during cleanup, an orphan Auth invitation may require manual cleanup; inspect operational logs and Auth users if the endpoint reports a failure.
- This phase does not create Supabase, configure Cloudflare secrets/KV, connect GitHub, or deploy the site.

## Recommended next step

Run the migrations and security acceptance matrix against a disposable Supabase project, resolve any PostgreSQL/RLS issues found, then repeat against the intended production project only after approval.
