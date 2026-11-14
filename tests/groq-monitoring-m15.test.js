import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('le worker confirme les scénarios sur bougies M5 avec contexte multi-timeframes stocké, sans appel IA',async()=>{const s=await read('netlify/functions/scenario-watch.mjs');assert.match(s,/interval='5min'/);assert.match(s,/Bougie M5 clôturée/);assert.match(s,/CONFIRMATION M5/);assert.match(s,/timeframe_analysis/);assert.match(s,/contextConflicts/);assert.doesNotMatch(s,/api\.groq\.com/);});
