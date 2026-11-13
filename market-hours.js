const FX = new Set(['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY']);
const METALS = new Set(['XAUUSD','XAGUSD']);
const CRYPTO = new Set(['BTCUSD','ETHUSD','SOLUSD','XRPUSD']);

function newYorkParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

/**
 * Standard weekly OTC FX/precious-metals session: Sunday 17:00 to Friday 17:00
 * America/New_York. Intl handles EST/EDT automatically. This is a weekend
 * schedule guard, not a holiday/early-close calendar.
 */
export function getMarketStatus(symbol, now = new Date()) {
  const code = String(symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (CRYPTO.has(code)) return { tradable: true, status: 'OPEN', market: 'CRYPTO', checkedAt: now.toISOString() };
  const market = FX.has(code) ? 'FOREX' : METALS.has(code) ? 'METALS' : 'UNKNOWN';
  if (market === 'UNKNOWN') return { tradable: true, status: 'UNRESTRICTED', market, checkedAt: now.toISOString() };
  const p = newYorkParts(now);
  const minute = Number(p.hour) * 60 + Number(p.minute);
  const weekday = p.weekday;
  const closed = weekday === 'Sat' || (weekday === 'Sun' && minute < 17 * 60) || (weekday === 'Fri' && minute >= 17 * 60);
  return {
    tradable: !closed,
    status: closed ? 'CLOSED' : 'OPEN',
    market,
    timezone: 'America/New_York',
    schedule: 'Dimanche 17:00 – vendredi 17:00 (heure de New York)',
    reason: closed ? 'Marché fermé pour le week-end. Aucune nouvelle analyse ni directive ne peut être générée avant la réouverture.' : null,
    checkedAt: now.toISOString()
  };
}
