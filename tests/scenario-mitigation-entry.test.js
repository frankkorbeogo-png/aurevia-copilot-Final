import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMitigationEntryConfirmation} from '../netlify/functions/scenario-watch.mjs';
const now=Date.parse('2026-11-14T12:00:00Z');
const bar=(minutes,open,high,low,close)=>({time:now-minutes*60000,open,high,low,close});
const mitigation=Date.parse('2026-11-14T11:49:00Z');
test('BUY: M5 clôturée après mitigation puis M1 postérieure confirme',()=>{
 const m5=[{},bar(10,101,104,100,103),bar(15,99,102,98,100)];
 const m1=[{},bar(3,103,106,102,105),bar(4,102,104,101,103)];
 assert.equal(evaluateMitigationEntryConfirmation('BUY',m5,m1,mitigation,now).confirmed,true);
});
test('SELL: M5 clôturée après mitigation puis M1 postérieure confirme',()=>{
 const m5=[{},bar(10,103,104,99,100),bar(15,101,103,101,102)];
 const m1=[{},bar(3,100,101,97,98),bar(4,101,102,99,100)];
 assert.equal(evaluateMitigationEntryConfirmation('SELL',m5,m1,mitigation,now).confirmed,true);
});
test('une bougie M5 commencée avant la mitigation est rejetée',()=>{
 const m5=[{},bar(10,101,104,100,103),bar(15,99,102,98,100)];
 const m1=[{},bar(3,103,106,102,105),bar(4,102,104,101,103)];
 const result=evaluateMitigationEntryConfirmation('BUY',m5,m1,Date.parse('2026-11-14T11:51:00Z'),now);
 assert.equal(result.confirmed,false);
 assert.match(result.reason,/avant la mitigation/);
});
test('M1 commencé avant la clôture de M5 ne peut pas confirmer',()=>{
 const m5=[{},bar(10,101,104,100,103),bar(15,99,102,98,100)];
 const m1=[{},bar(6,103,106,102,105),bar(7,102,104,101,103)];
 assert.equal(evaluateMitigationEntryConfirmation('BUY',m5,m1,mitigation,now).confirmed,false);
});
test('les bougies périmées ne peuvent pas confirmer une entrée',()=>{
 const m5=[{},bar(20,101,104,100,103),bar(25,99,102,98,100)];
 const m1=[{},bar(3,103,106,102,105),bar(4,102,104,101,103)];
 assert.equal(evaluateMitigationEntryConfirmation('BUY',m5,m1,mitigation,now).confirmed,false);
});
test('mitigation absente ou invalide bloque toute confirmation',()=>{
 const m5=[{},bar(10,101,104,100,103),bar(15,99,102,98,100)];
 const m1=[{},bar(3,103,106,102,105),bar(4,102,104,101,103)];
 assert.equal(evaluateMitigationEntryConfirmation('BUY',m5,m1,null,now).confirmed,false);
});
test('le worker transmet bien zone_reached_at au contrôle M5/M1',async()=>{
 const {readFile}=await import('node:fs/promises');const src=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
 assert.match(src,/s\.status==='zone_reached'&&!s\.entry_notified/);
 assert.match(src,/evaluateMitigationEntryConfirmation\(s\.direction,m5,m1,s\.zone_reached_at\)/);
});
