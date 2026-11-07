# Supabase schema verification

The sole database migration source for this project is `supabase/migrations/`.
The former root `migrations/0001_tracking.sql` was a legacy D1/SQLite migration and
has been removed: this project uses Supabase as its only database.

## Migration order

1. `0001_core_schema.sql` — core tables, indexes, triggers, admin helpers, RLS and seeds.
2. `0002_analytics_views.sql` — admin-only analytics views.
3. `0003_analytics_rpc.sql` — bounded analytics summary RPC.
4. `0004_lead_management.sql` — CRM fields and lead update trigger.
5. `0005_conversion_analytics.sql` — conversion analytics RPC.
6. `0006_security_hardening.sql` — explicit function and table privilege hardening.
7. `0007_admin_bootstrap_hardening.sql` — explicit server-only admin-profile and activity-log writes.

Apply to a **new/empty** Supabase project using the Supabase CLI:

```bash
supabase db reset
```

Or apply the SQL files in lexical order using the SQL Editor. Do not apply the legacy D1 SQL.

## First owner provisioning

Migrations intentionally do not promote arbitrary users to owner. Create the first user
through Supabase Auth, then provision that exact Auth UUID through a trusted one-time
SQL operation by the project owner:

```sql
insert into public.admin_profiles (user_id, display_name, role, is_active)
values ('<AUTH_USER_UUID>', 'Site Owner', 'owner', true);
```

Never expose the service-role key in a browser or commit it to Git. Do not add a self-service
admin-profile insert/update policy. Subsequent owner/admin provisioning must be performed
through a trusted server-side workflow with explicit owner authorization.

## Post-migration structural verification

After applying all seven migrations, run `supabase/tests/post_migration_verify.sql` in the SQL Editor. It checks required tables, views, helper/RPC functions, RLS enablement, and the expected policies/grants. It is a structural check, not a substitute for identity-based RLS tests.

## Manual security acceptance checks

1. Anonymous reads from all application tables and analytics views are denied.
2. An authenticated user without an `admin_profiles` row cannot read admin data or call admin RPCs successfully.
3. An active admin can read permitted admin data; owner-only export-job reads remain denied.
4. An inactive admin loses access immediately.
5. An owner can read export jobs.
6. Authenticated users cannot directly insert/update/delete privileged tables or change admin roles.
7. `google_sheets` and `telegram` are seeded disabled.
8. Duplicate keys, invalid event types, invalid JSON shapes and invalid foreign keys are rejected.
9. Analytics exclude admin traffic.
10. The service-role key is never returned by public configuration endpoints.

Static repository checks are not a substitute for running these tests against a disposable
Supabase/PostgreSQL instance with anonymous, ordinary authenticated, admin and owner identities.
