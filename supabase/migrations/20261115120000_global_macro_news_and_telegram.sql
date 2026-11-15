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
