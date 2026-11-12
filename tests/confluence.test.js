import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConfluence } from '../confluence.js';
const frame=(bias,ema,close,breaks=[],sweeps=[],ema50=null)=>({structure:{bias,breaks,sweeps},indicators:{ema200:ema,ema50},last:{close}});
const setup=(sweep='sell-side liquidity sweep',ema=2000,bias='haussier')=>({
 h4:frame(bias,ema,2010),
 m30:frame('haussier',null,2010,[{type:'BOS haussier'}]),
 m15:frame('haussier',null,2010,[{type:'CHoCH haussier'}],[],2005),
 m5:frame('range',null,null,[{type:'CHoCH haussier'}],[{type:sweep}]),
 m1:frame('range',null,null,[{type:'BOS haussier'}])
});
test('M30 et M15 déterminent la direction ; H4 et M5/M1 renforcent le score',()=>{
 const result=evaluateConfluence(setup());
 assert.equal(result.direction,'BUY');assert.equal(result.score,100);assert.equal(result.aligned,true);
});
test('un sweep du mauvais côté ne confirme pas le critère de liquidité BUY',()=>{
 const result=evaluateConfluence(setup('buy-side liquidity sweep'));
 assert.equal(result.score,95);assert.equal(result.aligned,true);
});
test('EMA200 manquante réduit le contexte H4 sans bloquer la direction M30/M15',()=>{
 const result=evaluateConfluence(setup('sell-side liquidity sweep',null));
 assert.equal(result.score,90);assert.equal(result.direction,'BUY');assert.equal(result.aligned,true);
});
test('un contexte H4 en range ne bloque pas un scénario M30/M15 valide',()=>{
 const result=evaluateConfluence(setup('sell-side liquidity sweep',2000,'range'));
 assert.equal(result.direction,'BUY');assert.equal(result.aligned,true);assert.equal(result.score,90);
});
test('un setup M30/M15 valide reste analysable sans BOS M30 ni cassure M15',()=>{
 const s=setup();s.m30.structure.breaks=[];s.m15.structure.breaks=[];
 const result=evaluateConfluence(s);
 assert.equal(result.aligned,true);assert.equal(result.score,70);
});
test('absence de déclencheur M5/M1 ne bloque pas le scénario directionnel M30/M15',()=>{
 const s=setup();s.m5.structure.breaks=[];s.m1.structure.breaks=[];
 const result=evaluateConfluence(s);
 assert.equal(result.aligned,true);assert.equal(result.score,95);
});
