import test from 'node:test';
import assert from 'node:assert/strict';
import {generateOpportunityScenarios} from '../opportunity-engine.js';
const analysis=(bias,close=2000)=>({last:{close},structure:{bias,breaks:[],sweeps:[],swings:[{type:'low',price:close-2},{type:'high',price:close+2}]},indicators:{ema200:close-10,rsi14:58,macd:{histogram:1},atr14:2}});
const frames={H4:{},H1:{},M30:{},M15:{},M5:{}};
test('génère un scénario BUY candidat depuis confluences techniques cohérentes',()=>{
 const analyses={H4:analysis('haussier'),H1:analysis('haussier'),M30:analysis('haussier'),M15:analysis('haussier'),M5:analysis('range')};
 const out=generateOpportunityScenarios({analyses,frames});
 assert.equal(out.buy?.status,'IDENTIFIED');assert.equal(out.buy?.entryStatus,'PENDING');assert.ok(out.buy.stopLoss<out.buy.entry);assert.equal(out.buy.takeProfits.length,3);
});
test('ne fabrique aucun scénario sans contexte directionnel',()=>{
 const analyses={H4:analysis('range'),H1:analysis('range'),M30:analysis('range'),M15:analysis('range'),M5:analysis('range')};
 assert.equal(generateOpportunityScenarios({analyses,frames}).buy,null);
});
test('ne génère pas de scénario si les données critiques sont périmées',()=>{
 const analyses={H4:analysis('haussier'),H1:analysis('haussier'),M30:analysis('haussier'),M15:analysis('haussier'),M5:analysis('haussier')};
 assert.equal(generateOpportunityScenarios({analyses,frames,staleFrames:['H4']}).buy,null);
});
