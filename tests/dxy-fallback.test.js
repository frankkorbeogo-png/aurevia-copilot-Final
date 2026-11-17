import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessDxyQuote} from '../netlify/functions/macro-context.mjs';
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
