import test from 'node:test';
import assert from 'node:assert/strict';
import { getMarketStatus } from '../market-hours.js';

test('generic US holiday does not close OTC Forex automatically', () => {
  const status = getMarketStatus('EURUSD', new Date('2026-11-26T17:00:00.000Z'));
  assert.equal(status.status, 'OPEN');
  assert.equal(status.tradable, true);
});

test('generic US holiday does not close spot XAUUSD automatically', () => {
  const status = getMarketStatus('XAUUSD', new Date('2026-11-26T17:00:00.000Z'));
  assert.equal(status.status, 'OPEN');
  assert.equal(status.tradable, true);
});

test('Forex weekend closure remains enforced', () => {
  const status = getMarketStatus('EURUSD', new Date('2026-11-28T15:00:00.000Z'));
  assert.equal(status.status, 'CLOSED');
  assert.equal(status.closureType, 'WEEKEND');
});

test('XAUUSD daily maintenance break remains explicit', () => {
  const status = getMarketStatus('XAUUSD', new Date('2026-11-16T22:30:00.000Z'));
  assert.equal(status.status, 'CLOSED');
  assert.equal(status.closureType, 'DAILY_BREAK');
});
