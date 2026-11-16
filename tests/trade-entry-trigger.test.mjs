import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEntryTrigger,isPendingOrderExpired } from '../netlify/functions/_trade-entry-trigger.mjs';

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
test('BUY STOP: uses trigger price, not planned entry, for activation',()=>{
 const p=pos({entry_price:105,trigger_price:110,last_observed_price:109,entry_armed:true});
 assert.equal(evaluateEntryTrigger(p,group('BUY STOP','BUY'),quote(110)).action,'ACTIVATE');
});
test('BUY STOP: first quote on trigger side cannot activate',()=>{
 const s=evaluateEntryTrigger(pos({entry_price:105,trigger_price:110}),group('BUY STOP','BUY'),quote(111));
 assert.equal(s.action,'TRACK');assert.equal(s.entry_armed,false);
});
test('SELL LIMIT: requires a lower price then upward crossing',()=>{
 const p=pos({last_observed_price:101,entry_armed:false});
 const armed={...p,...evaluateEntryTrigger(p,group('SELL LIMIT','SELL'),quote(99))};
 assert.equal(armed.entry_armed,true);
 assert.equal(evaluateEntryTrigger(armed,group('SELL LIMIT','SELL'),quote(100)).action,'ACTIVATE');
});
test('SELL STOP: uses trigger price, not planned entry, for activation',()=>{
 const p=pos({entry_price:95,trigger_price:90,last_observed_price:91,entry_armed:true});
 assert.equal(evaluateEntryTrigger(p,group('SELL STOP','SELL'),quote(90)).action,'ACTIVATE');
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

test('pending order expires at or after its expiry timestamp',()=>{
 const expiry='2026-11-15T12:00:00.000Z';
 assert.equal(isPendingOrderExpired({expires_at:expiry},Date.parse(expiry)-1),false);
 assert.equal(isPendingOrderExpired({expires_at:expiry},Date.parse(expiry)),true);
 assert.equal(isPendingOrderExpired({expires_at:null},Date.parse(expiry)),false);
});

test('le worker WebSocket persiste TRACK et TRIGGER_SEEN et n’active que ACTIVATE',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../workers/market-quote-stream.mjs',import.meta.url),'utf8');
 assert.match(source,/state\.action==='TRACK'/);
 assert.match(source,/state\.action==='TRIGGER_SEEN'/);
 assert.match(source,/state\.action!=='ACTIVATE'/);
 assert.match(source,/last_observed_price:state\.last_observed_price/);
 assert.match(source,/entry_armed:Boolean\(state\.entry_armed\)/);
 assert.match(source,/trigger_seen:true/);
 assert.match(source,/processingBySymbol/);
 assert.match(source,/isPendingOrderExpired\(p,now\)/);
 assert.doesNotMatch(source,/if\(result\?\.ok\)\{p\.status='OPEN'/);
});

test('le worker recharge entry_armed, last_observed_price et expires_at au redémarrage',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../workers/market-quote-stream.mjs',import.meta.url),'utf8');
 assert.match(source,/entry_armed,last_observed_price,expires_at/);
});
