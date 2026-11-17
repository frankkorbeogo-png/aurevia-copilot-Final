-- GDELT DOC 2.0 seendate is an observation timestamp, not a publisher publication timestamp.
-- Preserve it in seen_at and clear legacy false publication dates for this provider.
UPDATE public.global_news_events
SET seen_at = COALESCE(seen_at, published_at, created_at),
    published_at = NULL
WHERE source_provider = 'GDELT DOC 2.0'
  AND published_at IS NOT NULL;
