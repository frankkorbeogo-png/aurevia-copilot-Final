import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebSocketQuote, canProcessMarketTick } from '../workers/market-quote-guard.mjs';
import { evaluateEntryTrigger } from '../netlify/functions/_trade-entry-trigger.mjs';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');

test('WebSocket quote requires a valid provider timestamp', () => {
  assert.equal(normalizeWebSocketQuote({ symbol: 'XAU/USD', price: 4000 }, NOW), null);
  assert.equal(normalizeWebSocketQuote({ symbol: 'XAU/USD', price: 4000, timestamp: (NOW - 120000) / 1000 }, NOW), null);
  assert.equal(normalizeWebSocketQuote({ symbol: 'XAU/USD', price: 4000, timestamp: (NOW + 10000) / 1000 }, NOW), null);
  const quote = normalizeWebSocketQuote({ symbol: 'XAU/USD', price: 4000, timestamp: (NOW - 1000) / 1000 }, NOW);
  assert.equal(quote.price, 4000);
  assert.equal(quote.ageMs, 1000);
});

test('WebSocket quote processing respects Forex and metals market hours', () => {
  assert.equal(canProcessMarketTick('EUR/USD', new Date('2026-11-28T15:00:00.000Z')), false);
  assert.equal(canProcessMarketTick('XAU/USD', new Date('2026-11-16T22:30:00.000Z')), false);
  assert.equal(canProcessMarketTick('EUR/USD', new Date('2026-11-16T12:00:00.000Z')), true);
});

test('pending entry trigger returns explicit TRACK before an actual crossing', () => {
  const state = evaluateEntryTrigger(
    { entry_price: 4000, last_observed_price: null, entry_armed: false },
    { direction: 'BUY', order_type: 'BUY LIMIT' },
    { price: 4010 }
  );
  assert.equal(state.action, 'TRACK');
  assert.equal(state.entry_armed, true);
});

test('pending entry activates only after a safe-side to trigger-side crossing', () => {
  const state = evaluateEntryTrigger(
    { entry_price: 4000, last_observed_price: 4010, entry_armed: true },
    { direction: 'BUY', order_type: 'BUY LIMIT' },
    { price: 3999 }
  );
  assert.equal(state.action, 'ACTIVATE');
});
