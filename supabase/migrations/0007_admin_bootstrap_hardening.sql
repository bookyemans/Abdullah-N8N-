begin;

-- Admin profile writes remain server-only. This migration documents and enforces
-- that authenticated browser roles cannot mutate admin_profiles directly.
revoke insert, update, delete on public.admin_profiles from anon, authenticated;
revoke insert, update, delete on public.admin_activity_logs from anon, authenticated;

-- No public bootstrap RPC is intentionally provided. The first owner is provisioned
-- once through the Supabase Dashboard + SQL Editor (see docs/ADMIN_ACCOUNT_SETUP.md).

commit;
