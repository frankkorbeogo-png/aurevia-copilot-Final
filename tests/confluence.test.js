import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConfluence } from '../confluence.js';
const frame=(bias,breaks=[],sweeps=[])=>({structure:{bias,breaks,sweeps}});
const setup=(sweep='sell-side liquidity sweep')=>({
 m30:frame('haussier',[{type:'BOS haussier'}]),
 m15:frame('haussier',[{type:'CHoCH haussier'}]),
 m5:frame('range',[{type:'CHoCH haussier'}],[{type:sweep}])
});
test('M30 construit la direction, M15 la confronte et M5 confirme l’entrée',()=>{
 const result=evaluateConfluence(setup());
 assert.equal(result.direction,'BUY');assert.equal(result.score,100);assert.equal(result.aligned,true);
});
test('un sweep du mauvais côté ne confirme pas le critère de liquidité BUY',()=>{
 const result=evaluateConfluence(setup('buy-side liquidity sweep'));
 assert.equal(result.score,95);assert.equal(result.aligned,true);
});
test('la structure M30/M15 reste prioritaire sans filtre H4',()=>{
 const result=evaluateConfluence(setup());
 assert.equal(result.score,100);assert.equal(result.direction,'BUY');assert.equal(result.aligned,true);
});
test('un setup M30/M15 valide reste analysable sans BOS M30 ni cassure M15',()=>{
 const s=setup();s.m30.structure.breaks=[];s.m15.structure.breaks=[];
 const result=evaluateConfluence(s);
 assert.equal(result.aligned,true);assert.equal(result.score,70);
});
test('absence de déclencheur M5 ne bloque pas le scénario directionnel M30/M15',()=>{
 const s=setup();s.m5.structure.breaks=[];s.m5.structure.sweeps=[];
 const result=evaluateConfluence(s);
 assert.equal(result.aligned,true);assert.equal(result.score,90);
});
