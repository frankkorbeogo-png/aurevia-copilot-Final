import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRiskControls} from '../risk.js';

test('calcule la marge libre depuis l’equity et la marge utilisée',()=>{
 const r=calculateRiskControls({equity:1200,marginUsed:300,peakEquity:1200});
 assert.equal(r.freeMargin,900);
});

test('calcule les pertes journalières et hebdomadaires et leur solde restant',()=>{
 const r=calculateRiskControls({equity:1000,marginUsed:100,peakEquity:1100,dailyLossLimit:50,weeklyLossLimit:100,dailyPnl:-40,weeklyPnl:-75});
 assert.equal(r.dailyLossUsed,40);assert.equal(r.dailyLossRemaining,10);
 assert.equal(r.weeklyLossUsed,75);assert.equal(r.weeklyLossRemaining,25);
});

test('signale le dépassement des limites de pertes sans bloquer artificiellement les calculs',()=>{
 const r=calculateRiskControls({equity:900,marginUsed:200,peakEquity:1200,dailyLossLimit:50,weeklyLossLimit:100,dailyPnl:-55,weeklyPnl:-110});
 assert.equal(r.dailyLimitReached,true);assert.equal(r.weeklyLimitReached,true);
 assert.equal(r.freeMargin,700);
});

test('calcule le drawdown depuis le dernier pic d’equity',()=>{
 const r=calculateRiskControls({equity:1200,marginUsed:0,peakEquity:1500});
 assert.equal(r.drawdownAmount,300);assert.equal(r.drawdownPercent,20);
});

test('remonte automatiquement le pic lorsque l’equity dépasse l’ancien maximum',()=>{
 const r=calculateRiskControls({equity:1600,marginUsed:100,peakEquity:1500});
 assert.equal(r.peakEquity,1600);assert.equal(r.drawdownPercent,0);
});

test('une limite à zéro est désactivée et les données négatives sont refusées',()=>{
 const r=calculateRiskControls({equity:1000,marginUsed:0,peakEquity:1000,dailyLossLimit:0,weeklyLossLimit:0,dailyPnl:-20,weeklyPnl:-30});
 assert.equal(r.dailyLossRemaining,null);assert.equal(r.weeklyLossRemaining,null);
 assert.ok(calculateRiskControls({equity:-1,marginUsed:0,peakEquity:0}).error);
});
