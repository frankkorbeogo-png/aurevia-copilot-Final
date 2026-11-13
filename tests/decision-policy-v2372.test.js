import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanScenario} from '../netlify/functions/ai-analysis.mjs';

test('V2.3.72 accepte une directive M15 exploitable sans estimation de probabilité',()=>{
 const scenario={direction:'BUY',entryZone:{low:1998,high:2002},entry:2000,stopLoss:1990,takeProfits:[2010,2020],confirmationScore:62,reason:'Structure M15 haussière et momentum en reprise.',orderType:'BUY LIMIT'};
 const result=cleanScenario(scenario,'BUY',2001);
 assert.ok(result);
 assert.equal(result.probability,null);
 assert.equal(result.probabilityStatus,'NON_FOURNIE');
});

test('V2.3.72 rejette toujours les niveaux incohérents même si la probabilité est facultative',()=>{
 const scenario={direction:'BUY',entryZone:{low:1998,high:2002},entry:2000,stopLoss:2005,takeProfits:[2010],confirmationScore:62};
 assert.equal(cleanScenario(scenario,'BUY',2001),null);
});

test('Groq utilise le contexte macro avant et après publication sans le rendre bloquant',async()=>{const s=await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/ai-analysis.mjs',import.meta.url),'utf8');assert.match(s,/CONTEXTE FONDAMENTAL POUR TOUS LES INSTRUMENTS/);assert.match(s,/Après une annonce/);assert.match(s,/ne sont JAMAIS une condition obligatoire/);assert.match(s,/réaction réellement observée/);});
test('le contexte macro est demandé pour tous les instruments pris en charge',async()=>{const s=await (await import('node:fs/promises')).readFile(new URL('../analysis.js',import.meta.url),'utf8');assert.match(s,/fetchMacroContext\(symbol\)/);assert.doesNotMatch(s,/symbol==='XAUUSD'\?await fetchMacroContext/);});
