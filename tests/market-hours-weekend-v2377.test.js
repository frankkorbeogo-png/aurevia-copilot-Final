import test from 'node:test';
import assert from 'node:assert/strict';
import {getMarketStatus} from '../market-hours.js';
import {readFile} from 'node:fs/promises';

const ny = (iso) => new Date(iso);
test('les paires Forex sont fermées du vendredi 17h au dimanche avant 17h à New York', () => {
  assert.equal(getMarketStatus('EURUSD', ny('2026-11-13T22:30:00.000Z')).tradable, false); // Fri 17:30 EST
  assert.equal(getMarketStatus('GBPJPY', ny('2026-11-14T16:00:00.000Z')).tradable, false); // Saturday
  assert.equal(getMarketStatus('USDJPY', ny('2026-11-15T20:30:00.000Z')).tradable, false); // Sun 15:30 EST
});
test('les paires Forex rouvrent dimanche à 17h New York et sont ouvertes en semaine', () => {
  assert.equal(getMarketStatus('EURUSD', ny('2026-11-15T22:00:00.000Z')).tradable, true); // Sun 17:00 EST
  assert.equal(getMarketStatus('AUDUSD', ny('2026-11-13T21:59:00.000Z')).tradable, true); // Fri 16:59 EST
  assert.equal(getMarketStatus('EURGBP', ny('2026-11-11T12:00:00.000Z')).tradable, true);
});
test('les cryptomonnaies restent analysables le week-end', () => {
  assert.equal(getMarketStatus('BTCUSD', ny('2026-11-14T16:00:00.000Z')).tradable, true);
  assert.equal(getMarketStatus('ETH/USD', ny('2026-11-14T16:00:00.000Z')).tradable, true);
});
test('le serveur bloque les données marché et les directives IA quand le marché est fermé', async () => {
  const market = await readFile(new URL('../netlify/functions/market-data.mjs', import.meta.url), 'utf8');
  const ai = await readFile(new URL('../netlify/functions/ai-analysis.mjs', import.meta.url), 'utf8');
  assert.match(market, /code:'MARKET_CLOSED'/);
  assert.match(ai, /code:'MARKET_CLOSED'/);
});
test('le client désactive le bouton analyse et affiche le statut marché fermé', async () => {
  const analysis = await readFile(new URL('../analysis.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(analysis, /getMarketStatus\(symbol\)/);
  assert.match(app, /MARCHÉ FERMÉ/);
  assert.match(app, /analyzeButton\.disabled=!getMarketStatus/);
});
