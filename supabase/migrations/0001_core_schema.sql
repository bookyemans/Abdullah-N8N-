-- A5 website: Supabase primary database schema
-- Apply with Supabase CLI or SQL Editor. No secrets belong in this file.

begin;

create extension if not exists pgcrypto with schema extensions;

-- Keep application settings in UTC; clients may render in the administrator's timezone.
set timezone = 'UTC';

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_key text not null unique check (length(visitor_key) between 12 and 160),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_source text,
  last_source text,
  first_landing_path text,
  last_landing_path text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique check (length(session_key) between 12 and 160),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  landing_path text not null default '/',
  exit_path text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  source text,
  device_type text,
  browser text,
  operating_system text,
  country text,
  city text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint visitor_sessions_time_check check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique check (length(event_id) between 8 and 180),
  visitor_id uuid references public.visitors(id) on delete set null,
  session_id uuid references public.visitor_sessions(id) on delete set null,
  event_type text not null check (event_type in (
    'page_view', 'session_start', 'session_end', 'cta_click',
    'whatsapp_click', 'contact_submit', 'download',
    'visit', 'visit_exit', 'custom'
  )),
  page_path text not null default '/',
  occurred_at timestamptz not null default now(),
  source text,
  campaign text,
  properties jsonb not null default '{}'::jsonb,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint tracking_events_properties_object check (jsonb_typeof(properties) = 'object')
);

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_ref text not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'in_progress', 'replied', 'closed', 'spam')),
  source_page text,
  visitor_id uuid references public.visitors(id) on delete set null,
  session_id uuid references public.visitor_sessions(id) on delete set null,
  name text,
  email text,
  phone text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint contact_submissions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.email_open_events (
  id uuid primary key default gen_random_uuid(),
  recipient_hash text,
  campaign text,
  message_id text,
  subject text,
  country text,
  city text,
  user_agent text,
  requested_at timestamptz not null default now(),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  constraint email_open_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.site_settings (
  key text primary key check (length(key) between 1 and 100),
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint site_settings_value_object check (jsonb_typeof(value) in ('object', 'array', 'string', 'number', 'boolean', 'null'))
);

create table if not exists public.integration_settings (
  provider text primary key check (provider in ('google_sheets', 'telegram')),
  enabled boolean not null default false,
  options jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_status text check (last_test_status in ('success', 'failed', 'unknown')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint integration_options_object check (jsonb_typeof(options) = 'object')
);

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_activity_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (length(action) between 1 and 120),
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_activity_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.export_jobs (
  id bigint generated always as identity primary key,
  event_id text not null references public.tracking_events(event_id) on delete cascade,
  provider text not null check (provider = 'google_sheets'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, provider)
);

-- Supporting indexes for dashboards, timelines, filters and retry workers.
create index if not exists visitors_last_seen_idx on public.visitors (last_seen_at desc);
create index if not exists visitor_sessions_started_idx on public.visitor_sessions (started_at desc);
create index if not exists visitor_sessions_visitor_started_idx on public.visitor_sessions (visitor_id, started_at desc);
create index if not exists visitor_sessions_source_idx on public.visitor_sessions (source, started_at desc);
create index if not exists tracking_events_occurred_idx on public.tracking_events (occurred_at desc);
create index if not exists tracking_events_type_time_idx on public.tracking_events (event_type, occurred_at desc);
create index if not exists tracking_events_page_time_idx on public.tracking_events (page_path, occurred_at desc);
create index if not exists tracking_events_session_time_idx on public.tracking_events (session_id, occurred_at asc);
create index if not exists tracking_events_visitor_time_idx on public.tracking_events (visitor_id, occurred_at desc);
create index if not exists tracking_events_source_time_idx on public.tracking_events (source, occurred_at desc);
create index if not exists email_open_events_message_time_idx on public.email_open_events (message_id, requested_at desc);
create index if not exists contact_submissions_created_idx on public.contact_submissions (created_at desc);
create index if not exists contact_submissions_status_idx on public.contact_submissions (status, created_at desc);
create index if not exists admin_activity_logs_created_idx on public.admin_activity_logs (created_at desc);
create index if not exists export_jobs_retry_idx on public.export_jobs (status, next_attempt_at) where status in ('pending', 'failed');

-- Shared updated_at trigger.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists visitors_set_updated_at on public.visitors;
create trigger visitors_set_updated_at before update on public.visitors
for each row execute function public.set_updated_at();
drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at before update on public.site_settings
for each row execute function public.set_updated_at();
drop trigger if exists integration_settings_set_updated_at on public.integration_settings;
create trigger integration_settings_set_updated_at before update on public.integration_settings
for each row execute function public.set_updated_at();
drop trigger if exists admin_profiles_set_updated_at on public.admin_profiles;
create trigger admin_profiles_set_updated_at before update on public.admin_profiles
for each row execute function public.set_updated_at();
drop trigger if exists export_jobs_set_updated_at on public.export_jobs;
create trigger export_jobs_set_updated_at before update on public.export_jobs
for each row execute function public.set_updated_at();

-- Role helper: SECURITY DEFINER avoids recursive RLS when checking admin_profiles.
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true and p.role = 'owner'
  );
$$;

-- Enable RLS on every application table.
alter table public.visitors enable row level security;
alter table public.visitor_sessions enable row level security;
alter table public.tracking_events enable row level security;
alter table public.contact_submissions enable row level security;
alter table public.email_open_events enable row level security;
alter table public.site_settings enable row level security;
alter table public.integration_settings enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.export_jobs enable row level security;

-- Admin read policies. All writes are performed by trusted server functions using service role
-- only after validating the user's Auth token and admin role.
create policy "active admins read visitors" on public.visitors for select to authenticated using (public.is_active_admin());
create policy "active admins read sessions" on public.visitor_sessions for select to authenticated using (public.is_active_admin());
create policy "active admins read tracking events" on public.tracking_events for select to authenticated using (public.is_active_admin());
create policy "active admins manage contact submissions" on public.contact_submissions for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "active admins read email events" on public.email_open_events for select to authenticated using (public.is_active_admin());
create policy "active admins read settings" on public.site_settings for select to authenticated using (public.is_active_admin());
create policy "active admins read integrations" on public.integration_settings for select to authenticated using (public.is_active_admin());
create policy "admins read own profile or owner reads all" on public.admin_profiles for select to authenticated using (user_id = (select auth.uid()) or public.is_owner());
create policy "active admins read activity logs" on public.admin_activity_logs for select to authenticated using (public.is_active_admin());
create policy "owners read export jobs" on public.export_jobs for select to authenticated using (public.is_owner());

-- Do not grant anonymous table access. Authenticated reads are additionally constrained by RLS.
revoke all on public.visitors, public.visitor_sessions, public.tracking_events,
  public.contact_submissions, public.email_open_events, public.site_settings,
  public.integration_settings, public.admin_profiles, public.admin_activity_logs,
  public.export_jobs from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

grant select on public.visitors, public.visitor_sessions, public.tracking_events,
  public.contact_submissions, public.email_open_events, public.site_settings,
  public.integration_settings, public.admin_profiles, public.admin_activity_logs,
  public.export_jobs to authenticated;

grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- Safe defaults: Sheets remains disabled until explicitly enabled by the owner.
insert into public.integration_settings (provider, enabled, options)
values
  ('google_sheets', false, '{}'::jsonb),
  ('telegram', false, '{}'::jsonb)
on conflict (provider) do nothing;

insert into public.site_settings (key, value, description)
values
  ('tracking', '{"enabled": true, "track_page_views": true, "track_clicks": true, "exclude_admins": true}'::jsonb,
   'Non-secret tracking preferences'),
  ('privacy', '{"visitor_id_retention_days": 180, "event_retention_days": 365, "store_raw_ip": false}'::jsonb,
   'Privacy and retention preferences')
on conflict (key) do nothing;

commit;
