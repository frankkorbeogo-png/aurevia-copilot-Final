import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MARKET_INSTRUMENTS, MARKET_IDS, MARKET_LABELS, MARKET_PROVIDER_SYMBOLS } from '../market-catalog.js';
const read = f => readFile(new URL('../'+f, import.meta.url), 'utf8');
test('les sélecteurs exposent les actifs du catalogue multi-marchés', async () => {
  const html = await read('index.html');
  for (const id of MARKET_IDS) {
    assert.match(html, new RegExp('value="'+id+'"'));
  }
  assert.match(html, /id="analysisInstrumentSelect"/);
  assert.match(html, /id="instrumentSelect"/);
  assert.match(html, /id="myAnalysisInstrument"/);
});
test('le catalogue couvre forex, métaux, énergie, actions et crypto', () => {
  const categories = new Set(Object.values(MARKET_INSTRUMENTS).map(x=>x.market));
  for (const category of ['FOREX','METALS','EQUITY','CRYPTO']) assert.ok(categories.has(category), category);
  for (const id of ['XAUUSD','XAGUSD','EURAUD','EURCHF','GBPAUD','AUDJPY','AAPL','MSFT','NVDA','TSLA','AMZN','SOLUSD','XRPUSD']) assert.ok(MARKET_INSTRUMENTS[id], id);
  assert.equal(MARKET_IDS.length, MARKET_PROVIDER_SYMBOLS.length);
  assert.equal(MARKET_IDS.length, MARKET_LABELS.length);
});
test('le flux OHLC, les cotations et le moteur IA partagent le catalogue autorisé', async () => {
  const market = await read('netlify/functions/market-data.mjs');
  const quote = await read('netlify/functions/market-quote.mjs');
  const ai = await read('netlify/functions/ai-analysis.mjs');
  const analysis = await read('analysis.js');
  assert.match(market,/new Set\(MARKET_PROVIDER_SYMBOLS\)/);
  assert.match(quote,/new Set\(MARKET_PROVIDER_SYMBOLS\)/);
  assert.match(ai,/new Set\(MARKET_IDS\)/);
  assert.match(analysis,/Object\.entries\(MARKET_INSTRUMENTS\)/);
});
test('le suivi interne et le worker WebSocket acceptent les mêmes symboles affichés', async () => {
  const watch = await read('netlify/functions/trade-watch.mjs');
  const worker = await read('workers/market-quote-stream.mjs');
  assert.match(watch,/new Set\(MARKET_LABELS\)/);
  assert.match(worker,/new Set\(MARKET_LABELS\)/);
});
test('les symboles TradingView et les symboles fournisseur restent distincts dans le catalogue',()=>{
  for (const item of Object.values(MARKET_INSTRUMENTS)) {
    assert.ok(item.label && item.provider && item.tv && item.category && item.market);
  }
});
test('les sélecteurs et les cartes de marché sont synchronisés', async () => {
  const app = await read('app.js');
  assert.match(app,/MARKET_INSTRUMENTS/);
  assert.match(app,/analysisInstrumentSelect.*value=symbol/);
  assert.match(app,/instrumentSelect.*value=symbol/);
  assert.match(app,/setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(app,/analysisInstrumentSelect.*addEventListener\('change'/);
});
test('un seul cours est demandé pour la paire sélectionnée', async () => {
  const app = await read('app.js');
  assert.match(app,/api\/market-quote\?symbol=.*symbols\[selectedSymbol\]/);
  assert.match(app,/refreshSelectedQuote\(\)/);
});

test('le build de production embarque le catalogue importé par les modules client', async () => {
  const build = await read('scripts/build.mjs');
  assert.match(build, /'market-catalog\.js'/);
});

test('WTI et les instruments retirés ne figurent plus dans les sélecteurs actifs', async () => {
  const html = await read('index.html');
  const app = await read('app.js');
  assert.equal(MARKET_INSTRUMENTS.WTIUSD, undefined);
  assert.doesNotMatch(html, /WTI\/USD|WTIUSD|US30|NAS100|SPX500/);
  assert.doesNotMatch(app, /TVC:USOIL|PEPPERSTONE:US30|NASDAQ:NDX|SP:SPX/);
  assert.match(app, /TVC%3ADXY|TVC:DXY/);
});
