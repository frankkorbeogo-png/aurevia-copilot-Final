-- FRED release 101 was incorrectly mapped to a daily FOMC policy decision.
-- Retire those false reminders immediately; official Fed dates are rebuilt by global-news-sync.
UPDATE public.economic_release_events
SET is_active = false
WHERE release_id = 101
  AND source_provider = 'FRED release calendar'
  AND is_active = true;
