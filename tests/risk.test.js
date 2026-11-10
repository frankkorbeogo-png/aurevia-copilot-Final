import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePositionRisk } from '../risk.js';

test('calcule le volume à partir du montant monétaire à risquer', () => {
  const r = calculatePositionRisk({ balance: 200, riskAmount: 10, stopDistance: 5, unitValuePerLot: 100, lotStep: 0.01 });
  assert.equal(r.lots, 0.02);
  assert.equal(r.riskMoney, 10);
});

test('le solde du compte reste informatif et ne modifie pas le lot', () => {
  const a = calculatePositionRisk({ balance: 200, riskAmount: 10, stopDistance: 5, unitValuePerLot: 100 });
  const b = calculatePositionRisk({ balance: 2000, riskAmount: 10, stopDistance: 5, unitValuePerLot: 100 });
  assert.equal(a.lots, b.lots);
  assert.equal(a.riskMoney, b.riskMoney);
  assert.notEqual(a.riskPercentActual, b.riskPercentActual);
});

test('arrondit toujours le volume vers le bas selon le pas broker', () => {
  const r = calculatePositionRisk({ riskAmount: 9.9, stopDistance: 5, unitValuePerLot: 100, lotStep: 0.01 });
  assert.equal(r.lots, 0.01);
  assert.ok(r.riskMoney <= 9.9);
});

test('calcule gain potentiel, ratio R/R et marge seulement si la donnée existe', () => {
  const r = calculatePositionRisk({ balance: 200, riskAmount: 10, stopDistance: 5, unitValuePerLot: 100, rewardDistance: 10, marginPerLot: 220 });
  assert.equal(r.gain, 20);
  assert.equal(r.rr, 2);
  assert.equal(r.margin, 4.4);
  const noMargin = calculatePositionRisk({ riskAmount: 10, stopDistance: 5, unitValuePerLot: 100 });
  assert.equal(noMargin.margin, null);
});

test('refuse les paramètres invalides et un risque inférieur au lot minimal', () => {
  assert.ok(calculatePositionRisk({ riskAmount: 0, stopDistance: 5, unitValuePerLot: 100 }).error);
  assert.ok(calculatePositionRisk({ riskAmount: 0.1, stopDistance: 5, unitValuePerLot: 100, lotStep: 0.01 }).error);
});
