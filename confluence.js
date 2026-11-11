/** Score de confirmation technique explicable — jamais une probabilité statistique.
 * H4 = biais, M30 = structure, M15 = analyse centrale, M5/M1 = timing d'entrée.
 */
export function evaluateConfluence({ h4, m30, m15, m5, m1 }) {
  const bias = h4?.structure?.bias;
  const direction = bias === 'haussier' ? 'BUY' : bias === 'baissier' ? 'SELL' : null;
  const word = direction === 'BUY' ? 'haussier' : 'baissier';
  const ema = h4?.indicators?.ema200;
  const close = h4?.last?.close;
  const emaAligned = Boolean(direction && Number.isFinite(ema) && Number.isFinite(close) && (direction === 'BUY' ? close > ema : close < ema));
  const m30Break = Boolean(direction && (m30?.structure?.breaks || []).some(x => String(x.type).includes(word)));
  const m15Aligned = Boolean(direction && (m15?.structure?.bias === bias || (Number.isFinite(m15?.indicators?.ema50) && Number.isFinite(m15?.last?.close) && (direction === 'BUY' ? m15.last.close > m15.indicators.ema50 : m15.last.close < m15.indicators.ema50))));
  const m15Structure = Boolean(direction && (m15?.structure?.breaks || []).some(x => String(x.type).includes(word)));
  const m5Sweep = Boolean(direction && (m5?.structure?.sweeps || []).some(x => direction === 'BUY' ? String(x.type).includes('sell-side') : String(x.type).includes('buy-side')));
  const entryConfirm = Boolean(direction && ((m1?.structure?.breaks || []).some(x => String(x.type).includes(word)) || (m5?.structure?.breaks || []).some(x => String(x.type).includes(word))) && (m1?.last || m5?.last));
  const scoreComponents = [
    { label: 'Biais directionnel H4', passed: Boolean(direction), weight: 10 },
    { label: 'Prix aligné EMA200 H4', passed: emaAligned, weight: 10 },
    { label: 'Structure / BOS M30', passed: m30Break, weight: 10 },
    { label: 'Contexte principal M15 aligné', passed: m15Aligned, weight: 25 },
    { label: 'Structure confirmée M15', passed: m15Structure, weight: 25 },
    { label: 'Sweep de liquidité M5', passed: m5Sweep, weight: 10 },
    { label: 'Déclencheur d’entrée M5 / M1', passed: entryConfirm, weight: 10 }
  ];
  const score = scoreComponents.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  return { direction, score, scoreComponents, aligned: Boolean(direction && emaAligned && m30Break && m15Aligned && m15Structure && m5Sweep && entryConfirm) };
}
