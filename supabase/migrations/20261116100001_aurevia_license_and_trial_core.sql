create table public.aurevia_licenses (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  key_prefix text not null,
  plan_code text not null default 'standard',
  status text not null default 'issued' check (status in ('issued','active','suspended','revoked','expired')),
  duration_days integer check (duration_days is null or duration_days > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  max_active_sessions smallint not null default 1 check (max_active_sessions = 1),
  assigned_user_id uuid unique references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aurevia_license_activation_consistency check ((status = 'issued' and assigned_user_id is null and activated_at is null) or status <> 'issued')
);

create table public.aurevia_account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_status text not null default 'trial' check (access_status in ('trial','licensed','expired','suspended','revoked')),
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  license_id uuid references public.aurevia_licenses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aurevia_trial_window_valid check (trial_started_at is null or (trial_expires_at is not null and trial_expires_at > trial_started_at)),
  constraint aurevia_access_license_consistency check ((access_status = 'licensed' and license_id is not null) or access_status <> 'licensed')
);

create table public.aurevia_license_events (
  id bigint generated always as identity primary key,
  license_id uuid references public.aurevia_licenses(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('trial_started','trial_expired','license_issued','license_activated','license_suspended','license_revoked','license_reassigned','session_released')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index aurevia_license_events_user_created_idx on public.aurevia_license_events(user_id, created_at desc);
create index aurevia_licenses_status_created_idx on public.aurevia_licenses(status, created_at desc);
create index aurevia_account_access_status_idx on public.aurevia_account_access(access_status, updated_at desc);

alter table public.aurevia_licenses enable row level security;
alter table public.aurevia_account_access enable row level security;
alter table public.aurevia_license_events enable row level security;

revoke all on table public.aurevia_licenses from anon, authenticated, public;
revoke all on table public.aurevia_account_access from anon, authenticated, public;
revoke all on table public.aurevia_license_events from anon, authenticated, public;
grant select, insert, update, delete on table public.aurevia_licenses to service_role;
grant select, insert, update, delete on table public.aurevia_account_access to service_role;
grant select, insert, update, delete on table public.aurevia_license_events to service_role;
grant usage, select on sequence public.aurevia_license_events_id_seq to service_role;
