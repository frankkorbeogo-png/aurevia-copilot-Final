import test from 'node:test';
import assert from 'node:assert/strict';
import {generateOpportunityScenarios} from '../opportunity-engine.js';
import {evaluateEntryTrigger} from '../netlify/functions/_trade-entry-trigger.mjs';
import {validateM5AIConsensus} from '../m5-entry-validation.js';

function buildScenario(side,kind){
  const buy=side==='BUY',price=100,bias=buy?'haussier':'baissier';
  const zone=kind==='market'?[99,101]:kind==='stoplimit'?(buy?[101,102]:[98,99]):kind==='stop'?(buy?[101,102]:[98,99]):null;
  const breaks=['stoplimit','market'].includes(kind)?[{type:buy?'haussier':'baissier'}]:[];
  const indicators={atr14:1,ema20:buy?99:101,ema50:buy?98:102,ema200:buy?97:103,rsi14:buy?60:40,macd:{histogram:buy?1:-1}};
  const structure={bias,swings:[{type:'high',price:103},{type:'low',price:97}],breaks,sweeps:[{type:buy?'sell-side':'buy-side'}],orderBlocks:zone?[{type:buy?'bullish':'bearish',low:zone[0],high:zone[1],mitigated:false}]:[],fvg:[]};
  const analyses={M15:{last:{close:price},indicators,structure,patterns:[{name:buy?'bullish engulfing':'bearish engulfing'}]}};
  const candles=Array.from({length:40},(_,i)=>({time:i,open:price,high:price+1,low:price-1,close:price}));
  return generateOpportunityScenarios({analyses,frames:{M15:{candles}}})[side.toLowerCase()];
}

test('M15 scenario score is normalized to 100 and kept distinct',()=>{
  const result=buildScenario('BUY','market');
  assert.equal(result.score,100);
  assert.equal(result.scenarioScore,100);
  assert.equal(result.scoreComponents.reduce((sum,item)=>sum+item.weight,0),100);
  assert.equal(result.probability,null);
});

test('engine can emit all eight order variants',()=>{
  const expected={
    'BUY market':'BUY MARKET','BUY limit':'BUY LIMIT','BUY stop':'BUY STOP','BUY stoplimit':'BUY STOP LIMIT',
    'SELL market':'SELL MARKET','SELL limit':'SELL LIMIT','SELL stop':'SELL STOP','SELL stoplimit':'SELL STOP LIMIT'
  };
  for(const [key,type] of Object.entries(expected)){
    const [side,kind]=key.split(' ');
    assert.equal(buildScenario(side,kind).pendingOrderType,type,key);
  }
});

test('STOP LIMIT waits for trigger crossing then limit crossing',()=>{
  const position={entry_price:101.5,trigger_price:101.55,limit_price:101.5,trigger_seen:false,last_observed_price:null,entry_armed:false};
  const group={direction:'BUY',order_type:'BUY STOP LIMIT'};
  const first=evaluateEntryTrigger(position,group,{price:101});
  assert.equal(first.action,'TRACK');
  const second=evaluateEntryTrigger({...position,last_observed_price:101,entry_armed:true},group,{price:101.6});
  assert.equal(second.action,'TRIGGER_SEEN');
  const third=evaluateEntryTrigger({...position,trigger_seen:true,last_observed_price:101.6,entry_armed:true},group,{price:101.4});
  assert.equal(third.action,'ACTIVATE');
});

test('M5 entry price must be proposed and corroborated by all three AIs',()=>{
 const scenario={direction:'BUY',entryZoneLow:100,entryZoneHigh:102,stopLoss:98,takeProfits:[106]};
 const lead={decision:'CONFIRM',entryPrice:101,entryZoneLow:100.8,entryZoneHigh:101.2,score:80,reasoning:'Retest structurel M5'};
 const review={decision:'CONFIRM',entryPrice:101.05,score:75,verdict:'CONFIRME',reasoning:'Prix cohérent avec le retest'};
 const audit={decision:'CONFIRM',veto:false,score:85,criticalBlockers:[],reasoning:'Risque acceptable'};
 const result=validateM5AIConsensus({scenario,lead,review,audit,atr:0.4});
 assert.equal(result.confirmed,true);
 assert.equal(result.entryReference,101);
 assert.equal(result.components.length,3);
});
test('M5 consensus waits when AIs disagree on the entry price',()=>{
 const scenario={direction:'BUY',entryZoneLow:100,entryZoneHigh:102,stopLoss:98,takeProfits:[106]};
 const lead={decision:'CONFIRM',entryPrice:101,entryZoneLow:100.8,entryZoneHigh:101.2,score:80};
 const review={decision:'CONFIRM',entryPrice:102,score:75,verdict:'CONFIRME'};
 const audit={decision:'CONFIRM',veto:false,score:85,criticalBlockers:[]};
 const result=validateM5AIConsensus({scenario,lead,review,audit,atr:0.4});
 assert.equal(result.confirmed,false);
 assert.equal(result.entryReference,null);
 assert.match(result.reason,/désaccord sur le prix/);
});
test('M5 consensus vetoes prices outside the M15 zone or beyond SL/TP1',()=>{
 const scenario={direction:'BUY',entryZoneLow:100,entryZoneHigh:102,stopLoss:98,takeProfits:[106]};
 const lead={decision:'CONFIRM',entryPrice:105,entryZoneLow:104.8,entryZoneHigh:105.2,score:95};
 const review={decision:'CONFIRM',entryPrice:105,score:90,verdict:'CONFIRME'};
 const audit={decision:'CONFIRM',veto:false,score:90,criticalBlockers:[]};
 const result=validateM5AIConsensus({scenario,lead,review,audit});
 assert.equal(result.confirmed,false);
 assert.equal(result.entryReference,null);
});
