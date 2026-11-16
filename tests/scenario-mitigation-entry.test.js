import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateM5EntryConfirmation} from '../netlify/functions/scenario-watch.mjs';
const read=async()=>readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
test('le worker lance la validation M5 après que la zone a été atteinte',async()=>{
 const s=await read();
 assert.match(s,/s\.status==='zone_reached'&&!s\.entry_notified/);
 assert.match(s,/runAureviaM5Confirmation\(\{/);
 assert.match(s,/last_m5_analysis_at/);
});
test('la confirmation d’entrée utilise uniquement M5, jamais une séquence M5/M1',async()=>{
 const s=await read();
 assert.match(s,/candles\(s\.instrument,'5min','80'\)/);
 assert.doesNotMatch(s,/evaluateMitigationEntryConfirmation|candles\(s\.instrument,'1min'/);
});
test('la validation M5 explique le score et les facteurs techniques',()=>{
 const now=Date.parse('2026-11-14T12:00:00Z');
 const result=evaluateM5EntryConfirmation('BUY',[],now-60000,now);
 assert.equal(result.confirmed,false);
 assert.match(result.reason,/Historique M5 insuffisant/);
});
test('le worker utilise les fournisseurs IA configurés pour le contrôle M5',async()=>{
 const s=await read();
 assert.match(s,/runAureviaM5Confirmation/);
 const ai=await readFile(new URL('../netlify/functions/ai-collaboration.mjs',import.meta.url),'utf8');
 assert.match(ai,/configuredAIProviders\(\)/);
});
