import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEntryTrigger } from '../netlify/functions/_trade-entry-trigger.mjs';

const group=(order_type,direction)=>({order_type,direction});
const pos=(extra={})=>({entry_price:100,trigger_price:110,trigger_seen:false,entry_armed:false,last_observed_price:null,...extra});
const quote=price=>({price});

test('BUY LIMIT: first quote already below entry only establishes baseline',()=>{
 const s=evaluateEntryTrigger(pos(),group('BUY LIMIT','BUY'),quote(99));
 assert.equal(s.action,'TRACK');assert.equal(s.entry_armed,false);
});
test('BUY LIMIT: must return above entry then cross downward',()=>{
 let p=pos({last_observed_price:99,entry_armed:false});
 let s=evaluateEntryTrigger(p,group('BUY LIMIT','BUY'),quote(101));
 assert.equal(s.action,'TRACK');assert.equal(s.entry_armed,true);
 p={...p,...s};s=evaluateEntryTrigger(p,group('BUY LIMIT','BUY'),quote(100));
 assert.equal(s.action,'ACTIVATE');
});
test('BUY STOP: must be observed below entry before upward crossing',()=>{
 const p=pos({last_observed_price:101,entry_armed:false});
 const armed={...p,...evaluateEntryTrigger(p,group('BUY STOP','BUY'),quote(99))};
 assert.equal(armed.entry_armed,true);
 assert.equal(evaluateEntryTrigger(armed,group('BUY STOP','BUY'),quote(100)).action,'ACTIVATE');
});
test('SELL LIMIT: requires a lower price then upward crossing',()=>{
 const p=pos({last_observed_price:101,entry_armed:false});
 const armed={...p,...evaluateEntryTrigger(p,group('SELL LIMIT','SELL'),quote(99))};
 assert.equal(armed.entry_armed,true);
 assert.equal(evaluateEntryTrigger(armed,group('SELL LIMIT','SELL'),quote(100)).action,'ACTIVATE');
});
test('SELL STOP: requires a higher price then downward crossing',()=>{
 const p=pos({last_observed_price:99,entry_armed:false});
 const armed={...p,...evaluateEntryTrigger(p,group('SELL STOP','SELL'),quote(101))};
 assert.equal(armed.entry_armed,true);
 assert.equal(evaluateEntryTrigger(armed,group('SELL STOP','SELL'),quote(100)).action,'ACTIVATE');
});
test('BUY STOP LIMIT: stop and limit legs each require their own crossing',()=>{
 let p=pos({last_observed_price:109,entry_armed:true});
 let s=evaluateEntryTrigger(p,group('BUY STOP LIMIT','BUY'),quote(110));
 assert.equal(s.action,'TRIGGER_SEEN');
 p={...p,...s,trigger_seen:true};
 s=evaluateEntryTrigger(p,group('BUY STOP LIMIT','BUY'),quote(101));
 assert.equal(s.action,'TRACK');assert.equal(s.entry_armed,true);
 assert.equal(evaluateEntryTrigger({...p,...s,trigger_seen:true},group('BUY STOP LIMIT','BUY'),quote(100)).action,'ACTIVATE');
});
test('invalid price/order is ignored',()=>{
 assert.equal(evaluateEntryTrigger(pos(),group('BUY LIMIT','BUY'),quote(0)),null);
 assert.equal(evaluateEntryTrigger(pos(),group('BUY LIMIT','SELL'),quote(100)),null);
});

test('SELL STOP LIMIT: stop and limit legs each require their own crossing',()=>{
 let p=pos({entry_price:120,trigger_price:110,last_observed_price:111,entry_armed:true});
 let s=evaluateEntryTrigger(p,group('SELL STOP LIMIT','SELL'),quote(110));
 assert.equal(s.action,'TRIGGER_SEEN');
 p={...p,...s,trigger_seen:true};
 s=evaluateEntryTrigger(p,group('SELL STOP LIMIT','SELL'),quote(119));
 assert.equal(s.action,'TRACK');assert.equal(s.entry_armed,true);
 assert.equal(evaluateEntryTrigger({...p,...s,trigger_seen:true},group('SELL STOP LIMIT','SELL'),quote(120)).action,'ACTIVATE');
});
