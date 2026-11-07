# Phase 7 — Live Supabase validation

## Current status
The repository is prepared for a live connectivity preflight, but no live Supabase project is configured in this workspace. No database migration has been executed and no claim of live RLS validation is made.

## Safe prerequisites
1. Create a disposable Supabase project (not production) in the Supabase dashboard.
2. Keep the project URL, anon/publishable key, service-role/secret key, and database password in a local secret manager or shell environment. Never commit `.env` files or paste secrets into chat.
3. Install the Supabase CLI and Docker locally if you intend to use the local Supabase stack; alternatively use the dashboard SQL editor for the reviewed migrations.
4. Use a disposable project with no production data.

## Connectivity preflight
Set these environment variables in a private shell/CI secret store:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Then run:

```bash
npm run check:supabase-live
```

The script checks Auth settings with the public key and the REST root with the service-role key. It never prints key values. It does not execute SQL or validate RLS.

## Apply migrations
After confirming the target is an empty disposable project, apply `supabase/migrations/0001_*.sql` through `0007_*.sql` in lexical order using the Supabase SQL editor, or use the Supabase CLI migration workflow configured for the project. Stop on the first SQL error; do not skip a migration or continue against a partially initialized database.

## Required live acceptance tests
Create separate identities for anonymous, ordinary authenticated user, active admin, inactive admin, and owner. Verify the manual acceptance checks in `supabase/tests/README.md`, especially:

- anonymous cannot read application tables or analytics views;
- ordinary authenticated user cannot read admin data or execute admin RPCs;
- active admin can read only permitted records;
- inactive admin loses access;
- owner-only export access is enforced;
- authenticated browser roles cannot mutate `admin_profiles` or `admin_activity_logs`;
- service-role key is absent from every public response and browser asset.

Capture status codes and SQL error messages, but redact tokens, keys, database URLs with credentials, and personal data before sharing results.

## Bootstrap owner
After migrations succeed, run `supabase/tests/post_migration_verify.sql`. Only after its checks pass, create the owner Auth identity in Supabase Auth and run the one-time owner provisioning SQL documented in `supabase/tests/README.md`, substituting that exact Auth UUID. Do not enable public admin signup.


Current API key names are `SUPABASE_PUBLISHABLE_KEY` (public) and `SUPABASE_SECRET_KEY` (server-only). The legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` remain accepted as fallbacks. Never expose or paste the Secret Key into chat or source control.
