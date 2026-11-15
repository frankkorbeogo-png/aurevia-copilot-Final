-- GDELT ArtList seendate is the time GDELT first observed an article,
-- not necessarily the publisher's publication timestamp.
alter table public.global_news_events
  add column if not exists seen_at timestamptz;

update public.global_news_events
set seen_at = coalesce(seen_at, published_at, created_at)
where seen_at is null;

alter table public.global_news_events
  alter column published_at drop not null;

create index if not exists global_news_events_seen_idx
  on public.global_news_events(seen_at desc);
