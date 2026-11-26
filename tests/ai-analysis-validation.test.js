import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/ai-analysis.mjs';
test('le endpoint IA authentifié délègue au routeur multi-fournisseurs et décide sur M30',async()=>{
 const r=await handler({httpMethod:'GET'});
 assert.equal(r.statusCode,405);
 const source=await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/ai-analysis.mjs',import.meta.url),'utf8');
 assert.match(source,/runAureviaCollaboration/);
 assert.match(source,/probabilityDisclaimer/);
 assert.match(source,/decisionTimeframe:'M30'/);
});
test('le serveur exige un contexte M30 explicitement disponible et récent',async()=>{
 const source=await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/ai-analysis.mjs',import.meta.url),'utf8');
 assert.match(source,/M30_CONTEXT_REQUIRED/);
 assert.match(source,/m30\?\.available!==true/);
 assert.match(source,/m30Age>65\*60000/);
});
