import test from 'node:test';
import assert from 'node:assert/strict';
import {validateM5AIConsensus} from '../m5-entry-validation.js';

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
 assert.equal(result.components.length,3);
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
 const sql=await readFile(new URL('../supabase/migrations/20261116193000_aurevia_atomic_m5_analysis_claim.sql',import.meta.url),'utf8');
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
 assert.match(watch,/orderType\.endsWith\(' STOP LIMIT'\)/);
 assert.match(watch,/orderType\.endsWith\(' STOP'\)/);
 assert.match(watch,/orderType\.endsWith\('LIMIT'\)/);
 assert.match(watch,/entry:m5Entry,trigger_price:trigger,limit_price:limit/);
});
