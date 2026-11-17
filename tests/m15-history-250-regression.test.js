import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('le navigateur demande 251 bougies M15 pour conserver 250 bougies clôturées',async()=>{
 const source=await read('analysis.js');
 assert.match(source,/fetchFrame\(pair,FRAMES\.M15,251\)/);
 assert.match(source,/candles:m15\.candles\.slice\(-250\)/);
 assert.match(source,/outputsize=\$\{outputsize\}/);
});

test('le serveur refuse tout historique M15 incomplet et transmet les 250 sans troncature',async()=>{
 const source=await read('netlify/functions/ai-analysis.mjs');
 assert.match(source,/m15\.candles\.length!==250/);
 assert.match(source,/const candles=m15\.candles\.map\(c=>/);
 assert.doesNotMatch(source,/m15\.candles\.slice\(-40\)/);
 assert.match(source,/candleCountM15:candles\.length/);
 assert.match(source,/candleHistoryTarget:250/);
 assert.match(source,/candleHistoryComplete:candles\.length===250/);
});

test('chaque fournisseur de la collaboration reçoit le même historique M15 complet',async()=>{
 const source=await read('netlify/functions/ai-collaboration.mjs');
 assert.match(source,/candleCountM15:Array\.isArray\(market\.candles\)\?market\.candles\.length:0/);
 assert.match(source,/inputCandleCountM15:info\.candleCountM15/);
 assert.match(source,/marketData:market/);
 assert.match(source,/ask\(groq,messages/);
});
