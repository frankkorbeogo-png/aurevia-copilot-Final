import test from 'node:test';
import assert from 'node:assert/strict';
import { compactRoleMessages, parseJson } from '../netlify/functions/ai-collaboration.mjs';

function candles(count=250){
 const start=Date.parse('2026-11-18T00:00:00Z');
 return Array.from({length:count},(_,i)=>({
  t:new Date(start+i*30*60_000).toISOString(),
  o:3700+i*0.1,h:3702+i*0.1,l:3698+i*0.1,c:3701+i*0.1,
  v:123456,providerMetadata:'x'.repeat(200)
 }));
}
function payload(){
 return {
  instrument:'XAU/USD',decisionTimeframe:'M30',candles:candles(),
  indicators:{ema20:3700,ema50:3690,rsi14:54,macd:{value:1,signal:0.5},unused:'x'.repeat(5000)},
  structure:{bias:'BEARISH',breaks:Array.from({length:100},(_,i)=>({label:'BOS',price:i,description:'x'.repeat(300)}))},
  patterns:Array.from({length:30},(_,i)=>({name:'pattern-'+i,description:'x'.repeat(200)})),
  volumeProfile:{poc:3700,levels:Array.from({length:100},(_,i)=>({price:i,volume:999}))},
  fibonacci:{levels:Array.from({length:100},(_,i)=>i)},
  price:3701,previousClose:3702,
  context:{timeframes:{H4:{bias:'BEARISH',supports:[1,2,3,4,5,6]},H1:{bias:'BEARISH'},M15:{bias:'NEUTRAL'}},macro:{notice:'x'.repeat(3000),dxy:{price:100,asOf:'2026-11-18',usableForDirectionalBias:true}}}
 };
}
test('Groq compact retry keeps exactly 250 chronological OHLC candles and bounds metadata',()=>{
 const input=payload();
 const messages=[{role:'system',content:'system prompt'},{role:'user',content:JSON.stringify(input)}];
 const result=compactRoleMessages(messages,'groq',true);
 const out=JSON.parse(result[1].content);
 assert.equal(out.candles.length,250);
 assert.equal(out.candles[0].length,5);
 assert.equal(out.candles[0][0],Math.floor(Date.parse(input.candles[0].t)/1000));
 assert.equal(out.candles[1][0],1800);
 assert.equal(out.candles[249][0],1800);
 assert.equal(out.candles[0][1],input.candles[0].o);
 assert.equal(out.candles[249][4],input.candles[249].c);
 assert.equal('providerMetadata' in out.candles[0],false);
 assert.ok(result[1].content.length<45000);
});
test('Cloudflare keeps the 250 OHLC candles in object schema',()=>{
 const result=compactRoleMessages([{role:'user',content:JSON.stringify(payload())}],'cloudflare',false);
 const out=JSON.parse(result[0].content);
 assert.equal(out.candles.length,250);
 assert.equal(typeof out.candles[0],'object');
 assert.equal(out.candles[0].o,3700);
 assert.equal(out.candles[0].c,3701);
});
test('OpenRouter critic payload is bounded and preserves decision levels',()=>{
 const p={marketSummary:{instrument:'XAU/USD',latestCandles:Array.from({length:100},(_,i)=>[i,1,2,0,1]),indicators:payload().indicators,structure:payload().structure,patterns:payload().patterns,context:payload().context},
  groqAnalysis:{decision:'SELL',summary:'short',marketReading:'x'.repeat(10000),sell:{direction:'SELL',entry:3700,entryZone:{low:3699,high:3701},stopLoss:3710,takeProfits:[3690,3680,3670],reason:'reason'},risks:['risk']},
  cloudflareIndependentAnalysis:{decision:'WAIT',summary:'audit',marketReading:'y'.repeat(10000),veto:false,criticalBlockers:[]},selectedPrimary:'ANALYSTE_PRINCIPAL'};
 const result=compactRoleMessages([{role:'user',content:JSON.stringify(p)}],'openrouter',true);
 const out=JSON.parse(result[0].content);
 assert.equal(out.marketSummary.latestCandles.length,12);
 assert.equal(out.groqAnalysis.sell.entry,3700);
 assert.equal(out.groqAnalysis.sell.stopLoss,3710);
 assert.ok(result[0].content.length<12000);
});
test('M30 invalid candle count is rejected rather than silently shortened',()=>{
 const p=payload();p.candles=p.candles.slice(-249);
 assert.throws(()=>compactRoleMessages([{role:'user',content:JSON.stringify(p)}],'groq',true),{code:'M30_HISTORY_INCOMPLETE'});
});

test('Initial Groq request retains full OHLC object schema and all 250 candles',()=>{
 const input=payload();
 const result=compactRoleMessages([{role:'user',content:JSON.stringify(input)}],'groq',false);
 const out=JSON.parse(result[0].content);
 assert.equal(out.candles.length,250);
 assert.equal(Array.isArray(out.candles[0]),false);
 assert.equal(out.candles[0].t,input.candles[0].t);
 assert.equal(out.candles[249].c,input.candles[249].c);
});
test('JSON parser accepts fenced provider JSON',()=>{
 assert.deepEqual(parseJson('```json\n{"decision":"WAIT"}\n```'),{decision:'WAIT'});
});
