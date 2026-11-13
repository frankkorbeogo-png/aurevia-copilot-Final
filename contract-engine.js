/**
 * AUREVIA universal instrument-contract engine.
 * All monetary values produced by this module are expressed in the account currency.
 * No broker contract size, tick value, conversion or margin is inferred.
 */
const finite = value => Number.isFinite(Number(value));
const nullable = value => value === '' || value === null || value === undefined ? null : Number(value);

export function normalizeContractSpec(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const calculationType = String(source.calculationType || source.calculation_type || 'contract').toLowerCase();
  return {
    brokerName: String(source.brokerName || source.broker_name || '').trim().slice(0, 100),
    accountType: String(source.accountType || source.account_type || '').trim().slice(0, 80),
    accountCurrency: String(source.accountCurrency || source.account_currency || '').trim().toUpperCase().slice(0, 8),
    leverage: nullable(source.leverage),
    calculationType,
    contractSize: nullable(source.contractSize ?? source.contract_size),
    quoteToAccount: nullable(source.quoteToAccount ?? source.quote_to_account),
    pointSize: nullable(source.pointSize ?? source.point_size),
    pointValue: nullable(source.pointValue ?? source.point_value),
    tickSize: nullable(source.tickSize ?? source.tick_size),
    tickValue: nullable(source.tickValue ?? source.tick_value),
    minLot: nullable(source.minLot ?? source.min_lot),
    lotStep: nullable(source.lotStep ?? source.lot_step),
    maxLot: nullable(source.maxLot ?? source.max_lot),
    feesPerLot: nullable(source.feesPerLot ?? source.fees_per_lot) ?? 0,
    marginPerLot: nullable(source.marginPerLot ?? source.margin_per_lot),
    marginCurrency: String(source.marginCurrency || source.margin_currency || source.accountCurrency || source.account_currency || '').trim().toUpperCase().slice(0, 8)
  };
}

export function validateContractSpec(raw, { requireBroker = true } = {}) {
  const spec = normalizeContractSpec(raw);
  if (requireBroker && !spec.brokerName) return { ok: false, error: 'Renseignez le nom du broker utilisé.' };
  if (requireBroker && !spec.accountCurrency) return { ok: false, error: 'Renseignez la devise du compte.' };
  if (spec.accountCurrency && !/^[A-Z]{3,8}$/.test(spec.accountCurrency)) return { ok: false, error: 'Devise du compte invalide.' };
  if (spec.leverage !== null && (!finite(spec.leverage) || spec.leverage < 1 || spec.leverage > 100000)) return { ok: false, error: 'Le levier doit être compris entre 1 et 100000.' };
  if (!['contract', 'point', 'tick'].includes(spec.calculationType)) return { ok: false, error: 'Méthode de calcul inconnue.' };
  if (!finite(spec.minLot) || spec.minLot <= 0 || !finite(spec.lotStep) || spec.lotStep <= 0) return { ok: false, error: 'Renseignez un lot minimum et un pas de volume valides.' };
  if (spec.maxLot !== null && (!finite(spec.maxLot) || spec.maxLot < spec.minLot)) return { ok: false, error: 'Le lot maximum doit être supérieur ou égal au lot minimum.' };
  if (!finite(spec.feesPerLot) || spec.feesPerLot < 0) return { ok: false, error: 'Les frais par lot ne peuvent pas être négatifs.' };
  if (spec.marginPerLot !== null && (!finite(spec.marginPerLot) || spec.marginPerLot < 0)) return { ok: false, error: 'La marge par lot doit être positive ou nulle.' };
  if (spec.calculationType === 'contract' && (!finite(spec.contractSize) || spec.contractSize <= 0 || !finite(spec.quoteToAccount) || spec.quoteToAccount <= 0)) return { ok: false, error: 'La taille du contrat et le taux de conversion vers la devise du compte sont obligatoires.' };
  if (spec.calculationType === 'point' && (!finite(spec.pointSize) || spec.pointSize <= 0 || !finite(spec.pointValue) || spec.pointValue <= 0)) return { ok: false, error: 'La taille du point et sa valeur monétaire par lot sont obligatoires.' };
  if (spec.calculationType === 'tick' && (!finite(spec.tickSize) || spec.tickSize <= 0 || !finite(spec.tickValue) || spec.tickValue <= 0)) return { ok: false, error: 'La taille du tick et sa valeur monétaire par lot sont obligatoires.' };
  return { ok: true, spec };
}

export function getPriceUnitValuePerLot(raw) {
  const { spec, error } = (() => { const result = validateContractSpec(raw, { requireBroker: false }); return result.ok ? { spec: result.spec } : { error: result.error }; })();
  if (error) throw new Error(error);
  if (spec.calculationType === 'contract') return spec.contractSize * spec.quoteToAccount;
  if (spec.calculationType === 'point') return spec.pointValue / spec.pointSize;
  return spec.tickValue / spec.tickSize;
}

export function calculateContractPnl({ direction, entry, exit, volume, contractSpec, fees = null, ...legacy }) {
  if (!['BUY', 'SELL'].includes(direction) || ![entry, exit, volume].every(finite) || Number(entry) <= 0 || Number(exit) <= 0 || Number(volume) <= 0) throw new Error('Données de clôture invalides.');
  let spec = contractSpec ? normalizeContractSpec(contractSpec) : normalizeContractSpec({ calculationType: 'contract', contractSize: legacy.contractSize, quoteToAccount: legacy.quoteToAccount ?? 1, feesPerLot: legacy.feesPerLot ?? 0, minLot: 0.00000001, lotStep: 0.00000001 });
  const valid = validateContractSpec(spec, { requireBroker: false });
  if (!valid.ok) throw new Error(valid.error);
  const move = direction === 'BUY' ? Number(exit) - Number(entry) : Number(entry) - Number(exit);
  let gross;
  if (spec.calculationType === 'contract') gross = move * Number(volume) * spec.contractSize * spec.quoteToAccount;
  else if (spec.calculationType === 'point') gross = (move / spec.pointSize) * Number(volume) * spec.pointValue;
  else gross = (move / spec.tickSize) * Number(volume) * spec.tickValue;
  const feeAmount = fees === null ? Number(volume) * spec.feesPerLot : Number(fees);
  if (!finite(feeAmount) || feeAmount < 0) throw new Error('Frais de clôture invalides.');
  const round = value => Number(value.toFixed(2));
  return { gross: round(gross), fees: round(feeAmount), net: round(gross - feeAmount), currency: spec.accountCurrency || null };
}

export function calculateLotsFromRisk({ riskAmount, stopDistance, contractSpec, balance = 0, rewardDistance = null }) {
  if (!finite(riskAmount) || Number(riskAmount) <= 0 || !finite(stopDistance) || Number(stopDistance) <= 0) return { error: 'Le montant à risquer et la distance du stop doivent être positifs.' };
  let unitValue; try { unitValue = getPriceUnitValuePerLot(contractSpec); } catch (error) { return { error: error.message }; }
  const spec = normalizeContractSpec(contractSpec);
  const rawLots = Number(riskAmount) / (Number(stopDistance) * unitValue);
  const precision = Math.max(0, Math.min(8, (String(spec.lotStep).split('.')[1] || '').length));
  const lots = Number((Math.floor((rawLots + 1e-10) / spec.lotStep) * spec.lotStep).toFixed(precision));
  if (lots < spec.minLot) return { error: 'Le risque saisi est trop faible pour atteindre le lot minimum du broker.' };
  if (spec.maxLot !== null && lots > spec.maxLot) return { error: 'Le lot calculé dépasse le maximum autorisé par le broker.' };
  const riskMoney = lots * Number(stopDistance) * unitValue;
  const gain = finite(rewardDistance) && Number(rewardDistance) > 0 ? lots * Number(rewardDistance) * unitValue : null;
  return { lots, riskMoney: Number(riskMoney.toFixed(2)), lossPerLot: Number((Number(stopDistance) * unitValue).toFixed(2)), gain: gain === null ? null : Number(gain.toFixed(2)), rr: gain === null ? null : gain / riskMoney, riskPercentActual: finite(balance) && Number(balance) > 0 ? riskMoney / Number(balance) * 100 : null, margin: spec.marginPerLot !== null ? lots * spec.marginPerLot : null, unusedRisk: Math.max(0, Number(riskAmount) - riskMoney), currency: spec.accountCurrency || null };
}
