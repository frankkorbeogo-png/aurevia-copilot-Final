import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const market=await readFile(new URL('../netlify/functions/market-data.mjs',import.meta.url),'utf8');
const ai=await readFile(new URL('../netlify/functions/ai-analysis.mjs',import.meta.url),'utf8');
test('Twelve Data distingue quota, authentification et indisponibilité fournisseur',()=>{
 assert.match(market,/TWELVEDATA_QUOTA/);assert.match(market,/TWELVEDATA_AUTH_ERROR/);assert.match(market,/TWELVEDATA_UPSTREAM/);assert.match(market,/effectiveStatus/);
});
test('Twelve Data ne sert pas de cache périmé après un quota ou un refus de clé',()=>{
 assert.match(market,/lastError\?\.failure\?\.retryable&&lastError\?\.status!==429/);
});
test('Groq expose des codes diagnostiques sans renvoyer la clé API',()=>{
 for(const code of ['GROQ_AUTH','GROQ_QUOTA','GROQ_BAD_REQUEST','GROQ_UPSTREAM','GROQ_EMPTY_RESPONSE','GROQ_INVALID_JSON','GROQ_TIMEOUT'])assert.ok(ai.includes(code),`code manquant: ${code}`);
 assert.doesNotMatch(ai,/return json\([^\n]*key\s*[,}]/);
});
test('les diagnostics Groq bornent les détails fournisseur',()=>{
 assert.match(ai,/slice\(0,700\)/);assert.match(ai,/slice\(0,500\)/);
});
