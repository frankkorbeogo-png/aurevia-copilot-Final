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
