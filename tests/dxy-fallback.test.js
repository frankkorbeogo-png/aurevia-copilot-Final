import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessDxyQuote,fetchYahooIceDollarIndex} from '../netlify/functions/macro-context.mjs';
const macro=await readFile(new URL('../netlify/functions/macro-context.mjs',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('DXY has a timestamp-validated ICE futures fallback clearly labeled as a proxy',()=>{
 assert.match(macro,/DX-Y\.NYB/);assert.match(macro,/ICE U\.S\. Dollar Index futures/);assert.match(macro,/fetchYahooIceDollarIndex/);
 assert.match(macro,/assessment\.usableForDirectionalBias/);assert.match(macro,/proxy:true/);
});
test('DXY without a usable timestamp cannot create directional bias',()=>{
 const value=assessDxyQuote({close:'100.2'},Date.parse('2026-11-17T12:00:00Z'));assert.equal(value.usableForDirectionalBias,false);
});
test('DXY view exposes quote status, refresh and full interactive chart',()=>{
 assert.match(app,/refreshDxyOverview/);assert.match(app,/Exploitation IA/);assert.match(app,/Dernière cotation/);
 assert.match(html,/id="dxyQuoteOverview"/);assert.match(html,/symbols\/TVC-DXY/);
});

test('ICE Dollar Index futures fallback returns a timestamped, explicitly labeled proxy',async()=>{
 const timestamp=Math.floor(Date.now()/1000)-60;const original=globalThis.fetch;
 globalThis.fetch=async url=>{assert.match(String(url),/DX-Y\.NYB/);return new Response(JSON.stringify({chart:{result:[{meta:{regularMarketPrice:103.25,regularMarketTime:timestamp},timestamp:[timestamp],indicators:{quote:[{close:[103.25]}]}}],error:null}}),{status:200});};
 try{const value=await fetchYahooIceDollarIndex();assert.equal(value.symbol,'DX-Y.NYB');assert.equal(value.proxy,true);assert.equal(value.instrument,'ICE U.S. Dollar Index futures');assert.equal(value.usableForDirectionalBias,true);assert.equal(value.price,103.25);assert.equal(value.asOf,new Date(timestamp*1000).toISOString());}
 finally{globalThis.fetch=original;}
});
