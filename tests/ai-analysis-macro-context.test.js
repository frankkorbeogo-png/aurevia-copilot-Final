import test from 'node:test';
import assert from 'node:assert/strict';
import { compactMacroContext } from '../netlify/functions/ai-analysis.mjs';

test('AI keeps the eight newest GDELT headlines, not the oldest tail', () => {
  const articles = Array.from({ length: 12 }, (_, i) => ({ title: 'headline-' + i, seenAt: new Date(12 - i).toISOString() }));
  const result = compactMacroContext({ globalNews: { articles } });
  assert.deepEqual(result.globalNews.articles.map(x => x.title), [
    'headline-0','headline-1','headline-2','headline-3','headline-4','headline-5','headline-6','headline-7'
  ]);
});

test('AI keeps the eight nearest upcoming economic releases', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ event: 'release-' + i, scheduledAt: new Date(i).toISOString() }));
  const result = compactMacroContext({ economicReleaseSchedule: { events } });
  assert.deepEqual(result.economicReleaseSchedule.events.map(x => x.event), [
    'release-0','release-1','release-2','release-3','release-4','release-5','release-6','release-7'
  ]);
});
