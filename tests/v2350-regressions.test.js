import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('la fraîcheur M30 est obligatoire et les unités supérieures restent contextuelles',async()=>{
 const s=await read('analysis.js');
 assert.match(s,/requiredMissing/);assert.match(s,/requiredStale/);assert.match(s,/allRequiredAvailable/);
 assert.match(s,/FRAMES\.M30/);assert.match(s,/frames\.M30/);assert.doesNotMatch(s,/allFramesFresh/);
});
test('l’horloge locale démarre avant toute authentification',async()=>{
 const s=await read('app.js');assert.match(s,/function init\(\)\{bindEvents\(\);bindPositionContractFields\(\);updateClock\(\);setInterval\(updateClock,1000\)/);assert.match(s,/timeZone:'Africa\/Ouagadougou'/);
});
test('le calendrier économique affiché utilise exclusivement TradingView',async()=>{
 const s=await read('news.js');assert.match(s,/embed-widget-events\.js/);assert.match(s,/tradingview\.com\/economic-calendar/);assert.match(s,/importanceFilter:'-1,0,1'/);assert.doesNotMatch(s,/fetch\(['"]\/api\/economic-calendar/);
});
test('AUREVIA propose les scénarios à partir des 250 bougies M30',async()=>{
 const s=await read('analysis.js'),fn=await read('netlify/functions/ai-analysis.mjs');
 assert.match(s,/requestAureviaAnalysis/);assert.match(s,/api\/ai-analysis/);assert.match(s,/frames\.M30/);
 assert.match(fn,/runAureviaCollaboration/);assert.match(fn,/decisionTimeframe:'M30'/);assert.match(fn,/primary\.candles\.length!==250/);
});
