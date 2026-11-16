import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDxyQuote } from '../netlify/functions/macro-context.mjs';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');

test('recent timestamped DXY quote is usable but explicitly not realtime', () => {
  const result = assessDxyQuote({ close: '100.25', timestamp: (NOW - 60_000) / 1000 }, NOW);
  assert.equal(result.freshness, 'recent');
  assert.equal(result.usableForDirectionalBias, true);
  assert.equal(result.price, 100.25);
});

test('stale DXY quote is not usable for directional bias', () => {
  const result = assessDxyQuote({ close: '100.25', timestamp: (NOW - 30 * 60_000) / 1000 }, NOW);
  assert.equal(result.freshness, 'stale');
  assert.equal(result.usableForDirectionalBias, false);
});

test('future DXY quote is rejected for directional bias', () => {
  const result = assessDxyQuote({ close: '100.25', timestamp: (NOW + 10 * 60_000) / 1000 }, NOW);
  assert.equal(result.freshness, 'future');
  assert.equal(result.usableForDirectionalBias, false);
});

test('DXY quote without timestamp is not considered fresh', () => {
  const result = assessDxyQuote({ close: '100.25' }, NOW);
  assert.equal(result.freshness, 'unknown');
  assert.equal(result.usableForDirectionalBias, false);
});

test('DXY datetime with explicit timezone is parsed without altering its instant', () => {
  const result = assessDxyQuote({ close: '100.25', datetime: '2026-11-16T11:59:00+00:00' }, NOW);
  assert.equal(result.freshness, 'recent');
  assert.equal(result.usableForDirectionalBias, true);
  assert.equal(result.asOf, '2026-11-16T11:59:00.000Z');
});
