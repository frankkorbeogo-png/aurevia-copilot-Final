import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/ai-analysis.mjs';
test('le endpoint IA authentifié délègue au routeur multi-fournisseurs',async()=>{
 const r=await handler({httpMethod:'GET'});
 assert.equal(r.statusCode,405);
 const source=await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/ai-analysis.mjs',import.meta.url),'utf8');
 assert.match(source,/runAureviaAI/);
 assert.match(source,/probabilityDisclaimer/);
 assert.match(source,/decisionTimeframe:'M15'/);
});
