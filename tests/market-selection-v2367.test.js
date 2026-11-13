import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = f => readFile(new URL('../'+f, import.meta.url), 'utf8');
test('le sélecteur du moteur et celui du graphique exposent les 14 instruments Groq autorisés', async () => {
  const html = await read('index.html');
  const app = await read('app.js');
  const ids = ['XAUUSD','XAGUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','BTCUSD','ETHUSD'];
  for (const id of ids) {
    assert.match(html, new RegExp('value="'+id+'"'));
    assert.match(app, new RegExp(id+':\\{label:'));
  }
  assert.match(html, /id="analysisInstrumentSelect"/);
  assert.match(html, /id="instrumentSelect"/);
});
test('les sélecteurs et les cartes de marché sont synchronisés', async () => {
  const app = await read('app.js');
  assert.match(app, /analysisInstrumentSelect.*value=symbol/);
  assert.match(app, /instrumentSelect.*value=symbol/);
  assert.match(app, /setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(app, /analysisInstrumentSelect.*addEventListener\('change'/);
});
test('les cartes de marché n’affichent plus les cotations de toutes les paires', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /id="price-(XAUUSD|EURUSD|GBPUSD|USDJPY|BTCUSD|XAGUSD|ETHUSD)"/);
  assert.match(html, /id="selectedQuotePrice"/);
  assert.match(html, /id="selectedMarketQuote"/);
});
test('un seul cours est demandé pour la paire sélectionnée', async () => {
  const app = await read('app.js');
  assert.match(app, /api\/market-quote\?symbol=.*symbols\[selectedSymbol\]/);
  assert.match(app, /refreshSelectedQuote\(\)/);
});
