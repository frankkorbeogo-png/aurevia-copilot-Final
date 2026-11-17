import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../netlify/functions/market-quote.mjs',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('instrument quote uses the timestamped Twelve Data quote endpoint',()=>{
 assert.match(source,/api\.twelvedata\.com\/quote/);assert.match(source,/last_quote_at/);assert.match(source,/timestamp/);
 assert.doesNotMatch(source,/api\.twelvedata\.com\/time_series/);
});
test('selected instrument quote refreshes periodically while markets view is open',()=>{
 assert.match(app,/data-page-view="marches".*refreshSelectedQuote\(\);},60000/);
});

test('markets page mounts the TradingView ticker tape used for multi-instrument quotes',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="multiQuotesWidget"/);
 assert.match(app,/function mountTickerTape\(\)/);
 assert.match(app,/multiQuotesWidget/);
});
test('verified selected quote is reflected in its instrument tile and home watchlist',()=>{
 assert.match(app,/ticker-live-price/);
 assert.match(app,/\.home-asset\[data-symbol=/);
});
