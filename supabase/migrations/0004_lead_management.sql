-- Lead management: structured CRM fields and notification delivery tracking.
begin;

alter table public.contact_submissions
  add column if not exists company text,
  add column if not exists service text,
  add column if not exists budget text,
  add column if not exists referral_source text,
  add column if not exists admin_note text,
  add column if not exists delivery_status text not null default 'not_configured',
  add column if not exists delivery_error text,
  add column if not exists notification_sent_at timestamptz,
  add column if not exists status_updated_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.contact_submissions
  drop constraint if exists contact_submissions_delivery_status_check;
alter table public.contact_submissions
  add constraint contact_submissions_delivery_status_check
  check (delivery_status in ('not_configured', 'sent', 'failed'));

create index if not exists contact_submissions_service_created_idx
  on public.contact_submissions (service, created_at desc);
create index if not exists contact_submissions_email_created_idx
  on public.contact_submissions (lower(email), created_at desc);
create index if not exists contact_submissions_status_updated_idx
  on public.contact_submissions (status_updated_at desc);

create or replace function public.touch_contact_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.status is distinct from old.status then
    new.status_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists contact_submissions_touch on public.contact_submissions;
create trigger contact_submissions_touch
before update on public.contact_submissions
for each row execute function public.touch_contact_submission();

-- Explicitly keep the table unavailable to anonymous users. Server Functions
-- use the service role only after validating input or an administrator token.
revoke all on public.contact_submissions from anon;
grant select on public.contact_submissions to authenticated;

commit;
