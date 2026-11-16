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

test('les actions américaines ferment à 13 h le lendemain de Thanksgiving',()=>{
  const before=getMarketStatus('AAPL',new Date('2026-11-27T17:30:00.000Z'));
  const after=getMarketStatus('AAPL',new Date('2026-11-27T18:30:00.000Z'));
  assert.equal(before.tradable,true);
  assert.equal(after.tradable,false);
  assert.equal(after.closureType,'EARLY_CLOSE');
});
test('les actions américaines ferment à 13 h la veille de Noël',()=>{
  const status=getMarketStatus('NVDA',new Date('2026-12-24T18:30:00.000Z'));
  assert.equal(status.tradable,false);
  assert.equal(status.closureType,'EARLY_CLOSE');
});
test('la veille du jour de l’Indépendance tient compte du jour férié observé',()=>{
  const status=getMarketStatus('MSFT',new Date('2026-07-02T17:30:00.000Z'));
  assert.equal(status.tradable,false);
  assert.equal(status.closureType,'EARLY_CLOSE');
});
