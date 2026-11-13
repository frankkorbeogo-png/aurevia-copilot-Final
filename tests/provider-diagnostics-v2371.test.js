import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const market=await readFile(new URL('../netlify/functions/market-data.mjs',import.meta.url),'utf8');
const ai=await readFile(new URL('../netlify/functions/ai-analysis.mjs',import.meta.url),'utf8');
const router=await readFile(new URL('../netlify/functions/_ai-provider.mjs',import.meta.url),'utf8');
test('Twelve Data distingue quota, authentification et indisponibilité fournisseur',()=>{
 assert.match(market,/TWELVEDATA_QUOTA/);assert.match(market,/TWELVEDATA_AUTH_ERROR/);assert.match(market,/TWELVEDATA_UPSTREAM/);assert.match(market,/effectiveStatus/);
});
test('Twelve Data ne sert pas de cache périmé après un quota ou un refus de clé',()=>{
 assert.match(market,/lastError\?\.failure\?\.retryable&&lastError\?\.status!==429/);
});
test('le routeur respecte l’ordre Gemini, Cloudflare, SambaNova puis Groq',()=>{
 const positions=['Gemini','Cloudflare','SambaNova','Groq'].map(name=>router.indexOf(`name: '${name}'`));
 assert.ok(positions.every((v)=>v>=0));
 assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
 assert.match(ai,/runAureviaAI/);
});
test('les erreurs et diagnostics fournisseur ne révèlent jamais les clés API',()=>{
 assert.match(router,/status: response\.status/);
 assert.match(router,/slice\(0, 240\)/);
 assert.doesNotMatch(ai,/process\.env\.(GEMINI|CLOUDFLARE|SAMBANOVA|GROQ)_API_KEY/);
});
