import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261116154433_global_news_seen_at.sql', import.meta.url), 'utf8');
const cleanup = await readFile(new URL('../supabase/migrations/20261116230400_aurevia_gdelt_publication_date_cleanup.sql', import.meta.url), 'utf8');
const sync = await readFile(new URL('../netlify/functions/global-news-sync.mjs', import.meta.url), 'utf8');
const macro = await readFile(new URL('../netlify/functions/macro-context.mjs', import.meta.url), 'utf8');

test('GDELT first-seen time is migrated without preserving a false publication date', () => {
  assert.match(migration, /add column if not exists seen_at timestamptz/i);
  assert.match(migration, /set seen_at = coalesce\(seen_at, published_at, created_at\)/i);
  assert.match(cleanup, /set published_at = null\s+where source_provider = 'GDELT DOC 2\.0'/i);
  assert.match(migration, /alter column published_at drop not null/i);
});

test('GDELT sync and macro context use seen_at when publisher time is unknown', () => {
  assert.match(sync, /published_at:publishedAt,seen_at:seenAt/);
  assert.match(sync, /or=\(seen_at\.gte\./);
  assert.match(sync, /Repéré par GDELT/);
  assert.match(macro, /published_at,seen_at/);
  assert.match(macro, /dateBasis:x\.published_at\?'publisher_timestamp':'gdelt_first_seen'/);
});
