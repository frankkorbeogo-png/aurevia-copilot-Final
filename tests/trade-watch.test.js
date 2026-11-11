import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePositionThreshold} from '../netlify/functions/trade-watch.mjs';
test('surveillance interne détecte TP et SL BUY avec priorité SL si les deux niveaux sont franchis',()=>{
 const p={direction:'BUY',stop_loss:1980,take_profit:2020};
 assert.equal(evaluatePositionThreshold(p,2021),'TP');
 assert.equal(evaluatePositionThreshold(p,1979),'SL');
 assert.equal(evaluatePositionThreshold(p,2000),null);
 assert.equal(evaluatePositionThreshold(p,1970),'SL');
});
test('surveillance interne détecte TP et SL SELL',()=>{
 const p={direction:'SELL',stop_loss:2020,take_profit:1980};
 assert.equal(evaluatePositionThreshold(p,1979),'TP');
 assert.equal(evaluatePositionThreshold(p,2021),'SL');
 assert.equal(evaluatePositionThreshold(p,2000),null);
});
