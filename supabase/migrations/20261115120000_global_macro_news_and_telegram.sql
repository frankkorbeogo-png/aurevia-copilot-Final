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
