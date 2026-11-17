import test from 'node:test';
import assert from 'node:assert/strict';
import {validateM5AIConsensus} from '../m5-entry-validation.js';
import {runAureviaM5Confirmation} from '../netlify/functions/ai-collaboration.mjs';

function consensus(direction){
 const buy=direction==='BUY';
 const scenario={direction,entryZoneLow:99,entryZoneHigh:102,stopLoss:buy?98:103,takeProfits:[buy?106:95]};
 const price=100.5;
 return {scenario,
  lead:{decision:'CONFIRM',entryPrice:price,entryZoneLow:100.2,entryZoneHigh:100.8,score:82,reasoning:'Cassure puis retest M5'},
  review:{decision:'CONFIRM',entryPrice:price+0.01,score:78,verdict:'CONFIRME',reasoning:'Prix et structure corroborés'},
  audit:{decision:'CONFIRM',veto:false,score:88,criticalBlockers:[],reasoning:'Risque acceptable'}};
}
test('M5 BUY is confirmed only from three agreeing AI analyses and an AI-proposed price',()=>{
 const input=consensus('BUY'),result=validateM5AIConsensus({...input,atr:0.2});
 assert.equal(result.confirmed,true,result.reason);
 assert.equal(result.entryReference,100.5);
 assert.equal(result.score,83);
 assert.equal(result.components.length,3);
});
test('M5 accepts the raw Supabase scenario field names used by scenario-watch',()=>{
 const input=consensus('BUY');
 input.scenario={direction:'BUY',entry_low:99,entry_high:102,stop_loss:98,take_profits:[106]};
 const result=validateM5AIConsensus({...input,atr:0.2});
 assert.equal(result.confirmed,true,result.reason);
 assert.equal(result.entryReference,100.5);
});
test('M5 SELL is confirmed only from three agreeing AI analyses and an AI-proposed price',()=>{
 const input=consensus('SELL'),result=validateM5AIConsensus({...input,atr:0.2});
 assert.equal(result.confirmed,true,result.reason);
 assert.equal(result.entryReference,100.5);
});
test('M5 waits if the independent reviewer disagrees with the proposed price',()=>{
 const input=consensus('BUY');input.review.entryPrice=101.8;
 const result=validateM5AIConsensus({...input,atr:0.2});
 assert.equal(result.confirmed,false);
 assert.equal(result.entryReference,null);
 assert.match(result.reason,/désaccord sur le prix/);
});
test('M5 refuses a proposal outside the original M15 zone or beyond SL and TP1',()=>{
 const input=consensus('BUY');input.lead.entryPrice=105;input.lead.entryZoneLow=104.8;input.lead.entryZoneHigh=105.2;input.review.entryPrice=105;
 const result=validateM5AIConsensus(input);
 assert.equal(result.confirmed,false);
 assert.equal(result.entryReference,null);
});
test('the scheduled M5 watcher only analyses closed post-mitigation candles and atomically claims each candle once',async()=>{
 const {readFile}=await import('node:fs/promises');
 const watch=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
 const sql=await readFile(new URL('../supabase/migrations/20261117141509_aurevia_atomic_m5_analysis_claim.sql',import.meta.url),'utf8');
 const ai=await readFile(new URL('../netlify/functions/ai-collaboration.mjs',import.meta.url),'utf8');
 assert.match(watch,/s\.status==='zone_reached'&&!s\.entry_notified/);
 assert.match(watch,/x\.time\+5\*60000<=Date\.now\(\)/);
 assert.match(watch,/lastClosedM5\.time<Date\.parse\(s\.zone_reached_at/);
 assert.match(watch,/rpc\/aurevia_claim_m5_analysis/);
 assert.match(sql,/last_m5_analysis_at<p_closed_at/);
 assert.match(sql,/for update|update public\.aurevia_analysis_scenarios/i);
 assert.match(ai,/runAureviaM5Confirmation/);
 assert.doesNotMatch(watch,/evaluateM5EntryConfirmation/);
});
test('the confirmed M5 price is applied to the selected conditional order level',async()=>{
 const {readFile}=await import('node:fs/promises');
 const watch=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
 assert.match(watch,/orderType==='BUY STOP LIMIT'\|\|orderType==='SELL STOP LIMIT'/);
 assert.match(watch,/orderType\.endsWith\(' STOP'\)/);
 assert.match(watch,/orderType\.endsWith\('LIMIT'\)/);
 assert.match(watch,/entry:m5Entry,trigger_price:trigger,limit_price:limit/);
});

test('le worker limite les appels M5 IA et mutualise les cotations pour respecter le budget planifié',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/m5AiCalls>=1/);
 assert.match(source,/m5AiCalls\+\+/);
 assert.match(source,/quoteCache\.get\(s\.instrument\)/);
 assert.match(source,/order=updated_at\.asc/);
});

test('la contre-analyse OpenRouter et le veto Cloudflare M5 sont parallélisés après la proposition Groq',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/ai-collaboration.mjs',import.meta.url),'utf8');
 const i=source.indexOf('export async function runAureviaM5Confirmation');
 const j=source.indexOf('\n}',i);
 const m5=source.slice(i,j);
 assert.match(m5,/const \[reviewResult,auditResult\]=await Promise\.allSettled/);
 assert.match(m5,/ask\(openrouter,[\s\S]*?\],6500\)/);
 assert.match(m5,/ask\(cloudflare,[\s\S]*?\],6500\)/);
 assert.match(m5,/if\(reviewResult\.status!==\x27fulfilled\x27\)/);
 assert.match(m5,/if\(auditResult\.status!==\x27fulfilled\x27\)/);
});

test('le worker M5 respecte le budget de 30 secondes des fonctions planifiées',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/AbortSignal\.timeout\(5000\)/);
});

function configureM5Providers(t){
 const keys=['GROQ_API_KEY','OPENROUTER_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GEMINI_API_KEY'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.GROQ_API_KEY='test-groq';process.env.OPENROUTER_API_KEY='test-openrouter';process.env.CLOUDFLARE_API_TOKEN='test-cloudflare';process.env.CLOUDFLARE_ACCOUNT_ID='test-account';
 t.after(()=>keys.forEach(k=>old[k]===undefined?delete process.env[k]:process.env[k]=old[k]));
}
function providerResponse(value){return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{status:200,headers:{'content-type':'application/json'}});}
const m5Fixture={
 scenario:{direction:'BUY',entryZoneLow:100,entryZoneHigh:102,stopLoss:98,takeProfits:[106]},
 candles:Array.from({length:40},(_,i)=>({time:Date.now()-((39-i)*300000),open:100,high:101,low:99,close:100.5})),
 indicators:{atr14:0.5},structure:{bos:'bullish',choch:null}
};
const leadFixture={decision:'CONFIRM',entryPrice:100.5,entryZoneLow:100.2,entryZoneHigh:100.8,score:82,reasoning:'Retest M5 confirmé'};
const reviewFixture={decision:'CONFIRM',entryPrice:100.5,score:78,verdict:'CONFIRME',reasoning:'Prix cohérent',criticalBlockers:[]};
const auditFixture={decision:'CONFIRM',veto:false,score:75,reasoning:'Risque acceptable',criticalBlockers:[]};

test('la confirmation M5 appelle Groq puis les deux contrôles indépendants en parallèle',async t=>{
 configureM5Providers(t);
 const oldFetch=globalThis.fetch;const calls=[];let activeReviewers=0,maxActiveReviewers=0;
 globalThis.fetch=async url=>{
  const host=new URL(url).hostname;calls.push(host);
  if(host==='api.groq.com')return providerResponse(leadFixture);
  activeReviewers++;maxActiveReviewers=Math.max(maxActiveReviewers,activeReviewers);
  await new Promise(resolve=>setTimeout(resolve,80));
  activeReviewers--;
  return providerResponse(host==='openrouter.ai'?reviewFixture:auditFixture);
 };
 t.after(()=>globalThis.fetch=oldFetch);
 const result=await runAureviaM5Confirmation(m5Fixture);
 assert.equal(result.confirmed,true);
 assert.deepEqual(calls,['api.groq.com','openrouter.ai','api.cloudflare.com']);
 assert.equal(maxActiveReviewers,2);
 assert.equal(result.entryReference,100.5);
});

test('une réponse HTTP 503 d’OpenRouter bloque la confirmation M5 même si Groq et Cloudflare répondent',async t=>{
 configureM5Providers(t);
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  const host=new URL(url).hostname;
  if(host==='api.groq.com')return providerResponse(leadFixture);
  if(host==='openrouter.ai')return new Response('unavailable',{status:503});
  return providerResponse(auditFixture);
 };
 t.after(()=>globalThis.fetch=oldFetch);
 const result=await runAureviaM5Confirmation(m5Fixture);
 assert.equal(result.confirmed,false);
 assert.match(result.reason,/OpenRouter indisponible/);
});

test('une IA M5 obligatoire absente suspend immédiatement la validation sans appeler de fournisseur',async t=>{
 configureM5Providers(t);delete process.env.OPENROUTER_API_KEY;
 const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return providerResponse(leadFixture);};
 t.after(()=>globalThis.fetch=oldFetch);
 const result=await runAureviaM5Confirmation(m5Fixture);
 assert.equal(result.confirmed,false);assert.equal(calls,0);
 assert.match(result.reason,/les trois IA/);
});
