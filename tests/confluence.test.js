import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConfluence } from '../confluence.js';
const frame=(bias,ema,close,breaks=[],sweeps=[])=>({structure:{bias,breaks,sweeps},indicators:{ema200:ema},last:{close}});
test('score haussier complet exige EMA200, cassure M30, sweep des creux et cassure M5',()=>{
 const result=evaluateConfluence({h4:frame('haussier',2000,2010),m30:frame('range',null,null,[{type:'BOS haussier'}]),m5:frame('range',null,null,[{type:'CHoCH haussier'}],[{type:'sell-side liquidity sweep'}])});
 assert.equal(result.direction,'BUY');assert.equal(result.score,100);assert.equal(result.aligned,true);
});
test('un sweep du mauvais côté ne confirme pas un BUY',()=>{
 const result=evaluateConfluence({h4:frame('haussier',2000,2010),m30:frame('range',null,null,[{type:'BOS haussier'}]),m5:frame('range',null,null,[{type:'CHoCH haussier'}],[{type:'buy-side liquidity sweep'}])});
 assert.equal(result.score,80);assert.equal(result.aligned,false);
});
test('EMA200 manquante ne reçoit jamais une validation artificielle',()=>{
 const result=evaluateConfluence({h4:frame('haussier',null,2010),m30:frame('range',null,null,[{type:'BOS haussier'}]),m5:frame('range',null,null,[{type:'CHoCH haussier'}],[{type:'sell-side liquidity sweep'}])});
 assert.equal(result.score,80);assert.equal(result.aligned,false);
});
test('un contexte H4 en range ne produit aucun biais directionnel',()=>{
 const result=evaluateConfluence({h4:frame('range',2000,2010),m30:frame('range',null,null,[{type:'BOS haussier'}]),m5:frame('range',null,null,[{type:'CHoCH haussier'}],[{type:'sell-side liquidity sweep'}])});
 assert.equal(result.direction,null);assert.equal(result.aligned,false);
});
