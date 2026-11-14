import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('seule la fraîcheur M15 est obligatoire pour produire les scénarios',async()=>{const s=await read('analysis.js');assert.match(s,/requiredMissing/);assert.match(s,/requiredStale/);assert.match(s,/allRequiredAvailable/);assert.doesNotMatch(s,/allFramesFresh/);assert.match(s,/x\.tf==='M15'/);});
test('l’horloge locale démarre avant toute authentification',async()=>{const s=await read('app.js');assert.match(s,/function init\(\)\{bindEvents\(\);bindPositionContractFields\(\);updateClock\(\);setInterval\(updateClock,1000\)/);assert.match(s,/timeZone:'Africa\/Ouagadougou'/);});
test('le calendrier économique affiché provient exclusivement de TradingView',async()=>{const s=await read('news.js');assert.match(s,/embed-widget-events\.js/);assert.match(s,/tradingview\.com\/economic-calendar/);assert.doesNotMatch(s,/calendar-table|calendar-filters|fetch\(/);});
test('AUREVIA propose les scénarios à partir du seul jeu de données M15',async()=>{const s=await read('analysis.js');assert.match(s,/requestAureviaAnalysis/);assert.match(s,/api\/ai-analysis/);assert.match(s,/frames\.M15/);const fn=await read('netlify/functions/ai-analysis.mjs');assert.match(fn,/runAureviaAI/);assert.match(fn,/decisionTimeframe:'M15'/);});
