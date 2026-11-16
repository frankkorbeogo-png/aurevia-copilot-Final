import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateM5AIConsensus} from '../m5-entry-validation.js';
const read=async()=>readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
test('le worker lance la validation M5 IA après que la zone a été atteinte',async()=>{
 const s=await read();
 assert.match(s,/s\.status==='zone_reached'&&!s\.entry_notified/);
 assert.match(s,/runAureviaM5Confirmation\(\{/);
 assert.match(s,/last_m5_analysis_at/);
});
test('la confirmation d’entrée utilise uniquement des bougies M5 clôturées, jamais M1',async()=>{
 const s=await read();
 assert.match(s,/candles\(s\.instrument,'5min','80'\)/);
 assert.match(s,/x\.time\+5\*60000<=Date\.now\(\)/);
 assert.doesNotMatch(s,/evaluateM5EntryConfirmation|candles\(s\.instrument,'1min'/);
});
test('aucune entrée M5 n’est confirmée sans proposition des trois IA',()=>{
 const scenario={direction:'BUY',entryZoneLow:100,entryZoneHigh:102,stopLoss:98,takeProfits:[106]};
 const result=validateM5AIConsensus({scenario,lead:null,review:null,audit:null});
 assert.equal(result.confirmed,false);
 assert.equal(result.entryReference,null);
});
test('le worker utilise les trois fournisseurs IA configurés pour le contrôle M5',async()=>{
 const s=await read();
 assert.match(s,/runAureviaM5Confirmation/);
 const ai=await readFile(new URL('../netlify/functions/ai-collaboration.mjs',import.meta.url),'utf8');
 assert.match(ai,/configuredAIProviders\(\)/);
 assert.match(ai,/Groq/);assert.match(ai,/OpenRouter/);assert.match(ai,/Cloudflare/);
});

test('les prompts M5 utilisent CONFIRM/WAIT sans hériter du vocabulaire BUY/SELL de M15',async()=>{
 const ai=await readFile(new URL('../netlify/functions/ai-collaboration.mjs',import.meta.url),'utf8');
 const m5=ai.slice(ai.indexOf('export async function runAureviaM5Confirmation'));
 assert.match(m5,/const m5Base=.*CONFIRM et WAIT sont les seules décisions autorisées/);
 assert.match(m5,/const system=m5Base/);
 assert.match(m5,/const criticSystem=m5Base/);
 assert.match(m5,/const controlSystem=m5Base/);
});

test('la surveillance des scénarios s’arrête si le compte est suspendu ou sans licence active',async()=>{
 const s=await read();
 assert.match(s,/rpc\/aurevia_telegram_access_status/);
 assert.match(s,/access\?\.allowed!==true/);
 assert.match(s,/stop_reason:'Accès AUREVIA suspendu ou licence expirée'/);
});
