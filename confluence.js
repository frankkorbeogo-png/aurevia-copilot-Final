/** Score de confirmation technique explicable — jamais une probabilité statistique. */
export function evaluateConfluence({ h4, m30, m5 }) {
  const bias = h4?.structure?.bias;
  const direction = bias === 'haussier' ? 'BUY' : bias === 'baissier' ? 'SELL' : null;
  const word = direction === 'BUY' ? 'haussier' : 'baissier';
  const ema = h4?.indicators?.ema200;
  const close = h4?.last?.close;
  const emaAligned = Boolean(direction && Number.isFinite(ema) && Number.isFinite(close) && (direction === 'BUY' ? close > ema : close < ema));
  const m30Break = Boolean(direction && (m30?.structure?.breaks || []).some(x => String(x.type).includes(word)));
  // Un BUY exige un balayage des creux (sell-side) puis une cassure haussière ; SELL = miroir.
  const m5Sweep = Boolean(direction && (m5?.structure?.sweeps || []).some(x => direction === 'BUY' ? String(x.type).includes('sell-side') : String(x.type).includes('buy-side')));
  const m5Break = Boolean(direction && (m5?.structure?.breaks || []).some(x => String(x.type).includes(word)));
  const scoreComponents = [
    { label: 'Structure H4', passed: Boolean(direction) },
    { label: 'Prix aligné avec EMA200 H4', passed: emaAligned },
    { label: 'BOS / CHoCH confirmé sur M30', passed: m30Break },
    { label: 'Balayage de liquidité cohérent sur M5', passed: m5Sweep },
    { label: 'CHoCH / BOS de confirmation sur M5', passed: m5Break }
  ];
  const score = scoreComponents.filter(x => x.passed).length * 20;
  return { direction, score, scoreComponents, aligned: Boolean(direction && emaAligned && m30Break && m5Sweep && m5Break) };
}
