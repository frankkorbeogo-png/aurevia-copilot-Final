import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('le navigateur demande 251 bougies M30 pour conserver 250 bougies clôturées',async()=>{
 const source=await read('analysis.js');
 assert.match(source,/fetchFrame\(pair,FRAMES\.M30,251\)/);
 assert.match(source,/candles:primary\.candles\.slice\(-250\)/);
 assert.match(source,/outputsize=\$\{outputsize\}/);
});
test('le serveur refuse tout historique M30 incomplet et transmet les 250 bougies',async()=>{
 const source=await read('netlify/functions/ai-analysis.mjs');
 assert.match(source,/primary\.candles\.length!==250/);
 assert.match(source,/const candles=primary\.candles\.map\(c=>/);
 assert.doesNotMatch(source,/primary\.candles\.slice\(-40\)/);
 assert.match(source,/candleCountM30:candles\.length/);
 assert.match(source,/candleHistoryTarget:250/);
 assert.match(source,/candleHistoryComplete:candles\.length===250/);
});
test('les cinq fournisseurs de la collaboration reçoivent le même historique M30 complet',async()=>{
 const source=await read('netlify/functions/ai-collaboration.mjs');
 assert.match(source,/const candleCountM30=Array\.isArray\(market\.candles\)\?market\.candles\.length:0/);
 assert.match(source,/inputCandleCountM30:candleCountM30/);
 assert.match(source,/...messages\.filter\(m=>m\.role!=='system'\)/);
 assert.match(source,/const \[groqResult,cloudflareResult,openrouterResult,geminiResult,zaiResult\]/);
});
