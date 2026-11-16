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

test('arrondit toujours le volume vers le bas avec un incrément technique fixe de 0,01', () => {
  const r = calculatePositionRisk({ riskAmount: 9.9, stopDistance: 5, unitValuePerLot: 100 });
  assert.equal(r.lots, 0.01);
  assert.ok(r.riskMoney <= 9.9);
  const tooSmall = calculatePositionRisk({ riskAmount: 4.9, stopDistance: 5, unitValuePerLot: 100 });
  assert.match(tooSmall.error, /lot minimum de 0,01/);
});

test('calcule gain potentiel, ratio R/R et marge seulement si la donnée existe', () => {
  const r = calculatePositionRisk({ balance: 200, riskAmount: 10, stopDistance: 5, unitValuePerLot: 100, rewardDistance: 10, entryPrice: 2200, leverage: 1000 });
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


test('un risque USD et son équivalent XOF produisent le même lot après conversion', () => {
  const usd = calculatePositionRisk({ riskAmount: 50, stopDistance: 10, unitValuePerLot: 100, quoteToAccount: 1, lotStep: 0.01 });
  const xof = calculatePositionRisk({ riskAmount: 30000, stopDistance: 10, unitValuePerLot: 100, quoteToAccount: 600, lotStep: 0.01 });
  assert.equal(usd.lots, 0.05);
  assert.equal(xof.lots, usd.lots);
  assert.equal(xof.riskMoney, 30000);
});

test('le taux de conversion invalide est refusé', () => {
  const result = calculatePositionRisk({ riskAmount: 30000, stopDistance: 10, unitValuePerLot: 100, quoteToAccount: 0, lotStep: 0.01 });
  assert.ok(result.error);
});


test('un même risque économique garde le même lot dans toutes les devises proposées par AUREVIA', () => {
  const currencies = [
    { code: 'USD', rate: 1 },
    { code: 'EUR', rate: 0.92 },
    { code: 'GBP', rate: 0.79 },
    { code: 'JPY', rate: 150 },
    { code: 'CHF', rate: 0.88 },
    { code: 'AUD', rate: 1.52 },
    { code: 'CAD', rate: 1.38 },
    { code: 'NZD', rate: 1.66 },
    { code: 'XOF', rate: 600 }
  ];
  const usd = calculatePositionRisk({
    riskAmount: 50, stopDistance: 10, unitValuePerLot: 100,
    quoteToAccount: 1, lotStep: 0.01
  });
  for (const currency of currencies) {
    const equivalentRisk = 50 * currency.rate;
    const result = calculatePositionRisk({
      riskAmount: equivalentRisk, stopDistance: 10, unitValuePerLot: 100,
      quoteToAccount: currency.rate, lotStep: 0.01
    });
    assert.equal(result.lots, usd.lots, `lot différent pour ${currency.code}`);
  }
});


test('respecte un lot minimum, un pas et un plafond broker personnalisés',()=>{
 const r=calculatePositionRisk({riskAmount:12,stopDistance:1,unitValuePerLot:100,minLot:0.005,lotStep:0.001,maxLot:0.02});
 assert.equal(r.lots,0.02);assert.ok(r.riskMoney<=12);
 const tooSmall=calculatePositionRisk({riskAmount:0.4,stopDistance:1,unitValuePerLot:100,minLot:0.005,lotStep:0.001});
 assert.ok(tooSmall.error);
});
