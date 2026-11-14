import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMitigationEntryConfirmation} from '../netlify/functions/scenario-watch.mjs';
const now=Date.parse('2026-11-14T12:00:00Z');
const bar=(minutes,open,high,low,close)=>({time:now-minutes*60000,open,high,low,close});
test('BUY: entrée confirmée seulement après clôture directionnelle M5 et M1',()=>{
 const m5=[{},bar(5,101,104,100,103),bar(10,99,102,98,100)];
 const m1=[{},bar(1,103,106,102,105),bar(2,102,104,101,103)];
 assert.equal(evaluateMitigationEntryConfirmation('BUY',m5,m1,now).confirmed,true);
});
test('SELL: entrée confirmée seulement après clôture directionnelle M5 et M1',()=>{
 const m5=[{},bar(5,103,104,99,100),bar(10,101,103,101,102)];
 const m1=[{},bar(1,100,101,97,98),bar(2,101,102,99,100)];
 assert.equal(evaluateMitigationEntryConfirmation('SELL',m5,m1,now).confirmed,true);
});
test('une seule confirmation M5 ou M1 ne suffit pas',()=>{
 const m5=[{},bar(5,101,104,100,103),bar(10,99,102,98,100)];
 const m1=[{},bar(1,103,104,102,103.5),bar(2,102,104,101,103)];
 assert.equal(evaluateMitigationEntryConfirmation('BUY',m5,m1,now).confirmed,false);
});
test('les bougies périmées ne peuvent pas confirmer une entrée',()=>{
 const m5=[{},bar(20,101,104,100,103),bar(25,99,102,98,100)];
 const m1=[{},bar(5,103,106,102,105),bar(6,102,104,101,103)];
 assert.equal(evaluateMitigationEntryConfirmation('BUY',m5,m1,now).confirmed,false);
});
test('le worker déclenche les confirmations M5/M1 uniquement après le statut zone_reached',async()=>{
 const {readFile}=await import('node:fs/promises');const src=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
 assert.match(src,/s\.status==='zone_reached'&&!s\.entry_notified/);assert.match(src,/candles\(s\.instrument,'5min','4'\)/);assert.match(src,/candles\(s\.instrument,'1min','4'\)/);assert.doesNotMatch(src,/CONFIRMATION M15 · ENTRÉE CONFIRMÉE/);
});
