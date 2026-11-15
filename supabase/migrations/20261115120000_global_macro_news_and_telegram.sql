-- AUREVIA global macro/geopolitical headlines (GDELT DOC API).
-- Service-role only: headlines are fetched and broadcast by scheduled server functions.
create table if not exists public.global_news_events (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  title text not null,
  source_url text not null,
  source_domain text,
  source_country text,
  source_language text,
  published_at timestamptz not null,
  category text not null default 'macro_geopolitics',
  tone numeric,
  source_provider text not null default 'GDELT DOC 2.0',
  telegram_broadcast_started_at timestamptz,
  telegram_broadcast_completed_at timestamptz,
  telegram_broadcast_result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists global_news_events_published_idx
  on public.global_news_events(published_at desc);
alter table public.global_news_events enable row level security;
revoke all on public.global_news_events from anon, authenticated;
grant select, insert, update on public.global_news_events to service_role;
comment on table public.global_news_events is
  'Server-side global macro and geopolitical news metadata; source links are retained, article text is not republished.';

-- Official US economic release dates supplied by FRED; times are documented standard release times.
create table if not exists public.economic_release_events (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  release_id integer not null,
  event_name text not null,
  release_date date not null,
  scheduled_at timestamptz not null,
  source_timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  impact text not null default 'high',
  source_url text not null,
  source_provider text not null default 'FRED release calendar',
  time_basis text not null default 'standard_release_time',
  telegram_broadcast_started_at timestamptz,
  telegram_broadcast_completed_at timestamptz,
  telegram_broadcast_result jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(release_id, release_date)
);
create index if not exists economic_release_events_scheduled_idx
  on public.economic_release_events(scheduled_at asc);
alter table public.economic_release_events enable row level security;
revoke all on public.economic_release_events from anon, authenticated;
grant select, insert, update on public.economic_release_events to service_role;

create table if not exists public.economic_release_sync_state (
  id text primary key check (id = 'global'),
  last_synced_at timestamptz not null,
  source_provider text not null default 'FRED release calendar'
);
alter table public.economic_release_sync_state enable row level security;
revoke all on public.economic_release_sync_state from anon, authenticated;
grant select, insert, update on public.economic_release_sync_state to service_role;

-- Per-recipient delivery ledger: retries never resend to users already acknowledged by Telegram.
create table if not exists public.telegram_event_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('economic','global_news')),
  event_id uuid not null,
  chat_id text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(event_type,event_id,chat_id)
);
create index if not exists telegram_event_deliveries_pending_idx
  on public.telegram_event_deliveries(event_type,event_id,status,attempts);
alter table public.telegram_event_deliveries enable row level security;
revoke all on public.telegram_event_deliveries from anon, authenticated;
grant select, insert, update on public.telegram_event_deliveries to service_role;
