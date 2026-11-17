import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handler as quoteHandler} from '../netlify/functions/market-quote.mjs';
const source=await readFile(new URL('../netlify/functions/market-data.mjs',import.meta.url),'utf8');
test('le flux OHLC évite les nouvelles tentatives coûteuses et limite la durée fournisseur',()=>{
 assert.doesNotMatch(source,/attempt<2/);assert.ok(source.includes('AbortSignal.timeout(9000)'));
});
test('le cache OHLC conserve un marqueur explicite pour les données de diagnostic périmées',()=>{
 assert.ok(source.includes('CACHE_STALE_MAX_MS=30*60*1000'));
 assert.match(source,/stale:true/);assert.match(source,/staleAgeSeconds/);
});
test('le cache périmé ne masque pas une panne sans historique valide',()=>{
 assert.match(source,/Flux de marché temporairement indisponible/);
 assert.match(source,/retryable:true/);
});
function quoteRequest(symbol='XAU%2FUSD'){return {httpMethod:'GET',rawQuery:`symbol=${symbol}`,headers:{authorization:'Bearer header.eyJzdWIiOiIzZWQwYzcwMi0wM2YxLTQyNjQtOWU4NS03NDZkNjY0MDFiNTEiLCJzZXNzaW9uX2lkIjoiOWJkNjFjMWQtOThhOC00YjEzLTkyYmItODc5NmY4ZDBhOWIwIn0.signature'}};}
async function withQuoteEnvironment(fetchImpl,run){const old={...process.env},original=globalThis.fetch;Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable',SUPABASE_SERVICE_ROLE_KEY:'service',TWELVEDATA_API_KEY:'td'});globalThis.fetch=fetchImpl;try{return await run();}finally{globalThis.fetch=original;for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}}
test('le cours sélectionné est fondé sur une bougie horodatée et fraîche',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-16T19:00:00.000Z')});
 await withQuoteEnvironment(async input=>{const u=String(input);if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'3ed0c702-03f1-4264-9e85-746d66401b51'}),{status:200});if(u.includes('/rpc/aurevia_session_is_active_for_user')||u.includes('/rpc/aurevia_is_admin'))return new Response('true',{status:200});if(u.includes('api.twelvedata.com/quote'))return new Response(JSON.stringify({close:'4000.25',last_quote_at:Math.floor((Date.now()-30000)/1000)}),{status:200});throw new Error('URL inattendue '+u);},async()=>{const r=await quoteHandler(quoteRequest()),d=JSON.parse(r.body);assert.equal(r.statusCode,200);assert.equal(d.price,4000.25);assert.ok(d.quoteAt);assert.equal(d.interval,'1min');assert.ok(d.ageSeconds<=90);});
});
test('une dernière cotation datée est affichée hors séance sans être présentée comme récente',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-16T19:00:00.000Z')});
 await withQuoteEnvironment(async input=>{const u=String(input);if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'3ed0c702-03f1-4264-9e85-746d66401b51'}),{status:200});if(u.includes('/rpc/aurevia_session_is_active_for_user')||u.includes('/rpc/aurevia_is_admin'))return new Response('true',{status:200});if(u.includes('api.twelvedata.com/quote'))return new Response(JSON.stringify({close:'4000.25',last_quote_at:Math.floor((Date.now()-5*60*1000)/1000)}),{status:200});throw new Error('URL inattendue '+u);},async()=>{const r=await quoteHandler(quoteRequest('XAG%2FUSD')),d=JSON.parse(r.body);assert.equal(r.statusCode,200);assert.equal(d.freshness,'last_close');assert.equal(d.marketOpen,false);assert.match(d.displayLabel,/Dernière cotation disponible/);});
});
