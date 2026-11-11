import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConfluence } from '../confluence.js';
const frame=(bias,ema,close,breaks=[],sweeps=[],ema50=null)=>({structure:{bias,breaks,sweeps},indicators:{ema200:ema,ema50},last:{close}});
const setup=(sweep='sell-side liquidity sweep',ema=2000,bias='haussier')=>({
 h4:frame(bias,ema,2010),
 m30:frame('range',null,null,[{type:'BOS haussier'}]),
 m15:frame('haussier',null,2010,[{type:'CHoCH haussier'}],[],2005),
 m5:frame('range',null,null,[{type:'CHoCH haussier'}],[{type:sweep}]),
 m1:frame('range',null,null,[{type:'BOS haussier'}])
});
test('analyse centrale M15 et déclencheur M5/M1 donnent une confluence complète',()=>{
 const result=evaluateConfluence(setup());
 assert.equal(result.direction,'BUY');assert.equal(result.score,100);assert.equal(result.aligned,true);
});
test('un sweep du mauvais côté ne confirme pas un BUY',()=>{
 const result=evaluateConfluence(setup('buy-side liquidity sweep'));
 assert.equal(result.score,90);assert.equal(result.aligned,false);
});
test('EMA200 manquante ne reçoit jamais une validation artificielle',()=>{
 const result=evaluateConfluence(setup('sell-side liquidity sweep',null));
 assert.equal(result.score,90);assert.equal(result.aligned,false);
});
test('un contexte H4 en range ne produit aucun biais directionnel',()=>{
 const result=evaluateConfluence(setup('sell-side liquidity sweep',2000,'range'));
 assert.equal(result.direction,null);assert.equal(result.aligned,false);
});
