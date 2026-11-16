import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateM5EntryConfirmation} from '../netlify/functions/scenario-watch.mjs';

function candlesFor(direction,now=Date.now()){
  const step=5*60*1000;
  const rows=[];
  for(let i=0;i<79;i++){
    const trend=direction==='BUY'?1:-1;
    const base=100+trend*i*0.08;
    const wave=Math.sin(i*Math.PI/4)*0.6;
    const close=base+wave;
    const open=close-trend*0.06;
    rows.push({time:Math.floor(now/step)*step-(79-i)*step,open,high:Math.max(open,close)+0.12,low:Math.min(open,close)-0.12,close});
  }
  const prior=rows.at(-1);
  const pivot=direction==='BUY'
    ?Math.max(...rows.slice(-12).map(x=>x.high))
    :Math.min(...rows.slice(-12).map(x=>x.low));
  const open=prior.close;
  const close=direction==='BUY'?pivot+0.35:pivot-0.35;
  rows.push({time:Math.floor(now/step)*step-step,open,high:Math.max(open,close)+0.1,low:Math.min(open,close)-0.1,close});
  return rows;
}

test('M5 confirms a BUY after zone mitigation with a structural breakout and score',()=>{
  const now=Date.now(),bars=candlesFor('BUY',now),last=bars.at(-1);
  const result=evaluateM5EntryConfirmation('BUY',bars,last.time-1000,now);
  assert.equal(result.confirmed,true,result.reason);
  assert.ok(result.score>=65);
  assert.equal(result.entryReference,last.close);
  assert.match(result.reason,/Validation M5 confirmée/);
});

test('M5 confirms a SELL after zone mitigation with a structural breakdown and score',()=>{
  const now=Date.now(),bars=candlesFor('SELL',now),last=bars.at(-1);
  const result=evaluateM5EntryConfirmation('SELL',bars,last.time-1000,now);
  assert.equal(result.confirmed,true,result.reason);
  assert.ok(result.score>=65);
  assert.equal(result.entryReference,last.close);
});

test('M5 cannot validate with a candle that began before mitigation',()=>{
  const now=Date.now(),bars=candlesFor('BUY',now),last=bars.at(-1);
  const result=evaluateM5EntryConfirmation('BUY',bars,last.time+1,now);
  assert.equal(result.confirmed,false);
  assert.match(result.reason,/après l’arrivée dans la zone/);
});

test('M5 rejects stale closed candles',()=>{
  const now=Date.now(),bars=candlesFor('BUY',now),last=bars.at(-1);
  const result=evaluateM5EntryConfirmation('BUY',bars,last.time-1000,last.time+16*60*1000);
  assert.equal(result.confirmed,false);
  assert.match(result.reason,/trop ancienne/);
});

test('M5 refuses insufficient history and invalid direction',()=>{
  const now=Date.now();
  assert.equal(evaluateM5EntryConfirmation('BUY',candlesFor('BUY',now).slice(-20),now-60000,now).confirmed,false);
  assert.equal(evaluateM5EntryConfirmation('WAIT',candlesFor('BUY',now),now-60000,now).confirmed,false);
});

test('the AI-proposed M5 entry price is stored and shown separately',async()=>{
  const {readFile}=await import('node:fs/promises');
  const watch=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.match(watch,/entry_confirmation_price:m5Entry/);
  assert.match(watch,/entry_confirmation_score:confirmation\.score/);
  assert.match(watch,/Entrée indicative M5 : \$\{m5Entry\}/);
  assert.match(app,/scenario\.entry_confirmation_price\?\?scenario\.entry/);
});
