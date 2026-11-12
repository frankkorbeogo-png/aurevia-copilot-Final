import test from 'node:test';
import assert from 'node:assert/strict';
import {generateOpportunityScenarios} from '../opportunity-engine.js';
const analysis=(bias,close=2000)=>({last:{close},structure:{bias,breaks:[],sweeps:[],swings:[{type:'low',price:close-2},{type:'high',price:close+2}]},indicators:{ema200:close-10,rsi14:58,macd:{histogram:1},atr14:2}});
const frames={H4:{},H1:{},M30:{},M15:{},M5:{}};
const neutral=(bias='range',close=2000)=>({last:{close},structure:{bias,breaks:[],sweeps:[],swings:[{type:'low',price:close-2},{type:'high',price:close+2}]},indicators:{ema200:close,rsi14:50,macd:{histogram:0},atr14:2}});
test('génère un scénario BUY candidat depuis confluences techniques cohérentes',()=>{
 const analyses={H4:analysis('haussier'),H1:analysis('haussier'),M30:analysis('haussier'),M15:analysis('haussier'),M5:analysis('range')};
 const out=generateOpportunityScenarios({analyses,frames});
 assert.equal(out.buy?.status,'IDENTIFIED');assert.equal(out.buy?.entryStatus,'PENDING');assert.ok(out.buy.stopLoss<out.buy.entry);assert.equal(out.buy.takeProfits.length,3);assert.equal(out.buy.pendingOrderType,'BUY LIMIT');assert.equal(out.buy.limitPrice,out.buy.entry);assert.equal(out.buy.triggerPrice,null);
});
test('fournit des niveaux indicatifs WATCH sans contexte directionnel, sans les présenter comme un signal',()=>{
 const analyses={H4:neutral(),H1:neutral(),M30:neutral(),M15:neutral(),M5:neutral()};
 const out=generateOpportunityScenarios({analyses,frames});assert.equal(out.buy?.status,'WATCH');assert.equal(out.sell?.status,'WATCH');assert.equal(out.buy?.probability,null);
});
test('ne génère pas de scénario si les données critiques sont périmées',()=>{
 const analyses={H4:analysis('haussier'),H1:analysis('haussier'),M30:analysis('haussier'),M15:analysis('haussier'),M5:analysis('haussier')};
 assert.equal(generateOpportunityScenarios({analyses,frames,staleFrames:['H4']}).buy,null);
});

test('identifie un scénario conditionnel par confluence EMA/MACD/RSI même si la structure est encore en range',()=>{
 const rangeWithBullishMomentum=analysis('range');
 const analyses={H4:neutral(),H1:neutral(),M30:rangeWithBullishMomentum,M15:rangeWithBullishMomentum,M5:analysis('range')};
 const out=generateOpportunityScenarios({analyses,frames});
 assert.equal(out.buy?.status,'IDENTIFIED');
 assert.equal(out.buy?.entryStatus,'PENDING');
 assert.ok(out.buy.entry>out.buy.stopLoss);
});

test('autorise un seul scénario BUY quand M30 fournit une confluence suffisante, sans exiger un scénario SELL ni un vote M15',()=>{
 const m30=analysis('haussier');
 const analyses={H4:neutral(),H1:neutral(),M30:m30,M15:neutral(),M5:analysis('range')};
 const out=generateOpportunityScenarios({analyses,frames});
 assert.equal(out.buy?.status,'IDENTIFIED');
 assert.equal(out.sell?.status,'WATCH');
 assert.equal(out.buy?.entryStatus,'PENDING');
 assert.ok(out.buy.entry>out.buy.stopLoss);
 assert.equal(out.buy.takeProfits.length,3);
});
test('un signal isolé produit seulement un plan WATCH, jamais une entrée identifiée',()=>{
 const m30=neutral();m30.indicators.ema200=1990;
 const analyses={H4:neutral(),H1:neutral(),M30:m30,M15:neutral(),M5:neutral()};
 const out=generateOpportunityScenarios({analyses,frames});
 assert.equal(out.buy?.status,'WATCH');
 assert.equal(out.sell?.status,'WATCH');
});

test('propose un ordre SELL LIMIT sur une zone de résistance au-dessus du cours',()=>{
 const analyses={H4:analysis('baissier'),H1:analysis('baissier'),M30:analysis('baissier'),M15:analysis('baissier'),M5:neutral()};
 const out=generateOpportunityScenarios({analyses,frames});
 assert.equal(out.sell?.status,'IDENTIFIED');assert.equal(out.sell.pendingOrderType,'SELL LIMIT');assert.equal(out.sell.limitPrice,out.sell.entry);assert.equal(out.sell.triggerPrice,null);
});
test('le scénario potentiel expose le type d’ordre sans le confondre avec une entrée confirmée',()=>{
 const analyses={H4:analysis('haussier'),H1:analysis('haussier'),M30:analysis('haussier'),M15:analysis('haussier'),M5:analysis('range')};
 const out=generateOpportunityScenarios({analyses,frames});
 assert.equal(out.buy.entryStatus,'PENDING');assert.ok(['BUY LIMIT','BUY STOP'].includes(out.buy.pendingOrderType));assert.match(out.buy.orderRationale,/confirmation M5|clôture M5/);
});
test('l’interface affiche le type d’ordre et sa logique pour chaque scénario potentiel',async()=>{
 const {readFile}=await import('node:fs/promises');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/Type d’ordre potentiel/);
 assert.match(app,/Logique de l’ordre/);
});
