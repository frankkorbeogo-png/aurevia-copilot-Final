const FX = new Set(['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY']);
const METALS = new Set(['XAUUSD','XAGUSD']);
const CRYPTO = new Set(['BTCUSD','ETHUSD','SOLUSD','XRPUSD']);

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

/**
 * Weekly FX/precious-metals weekend schedule in Burkina Faso local time:
 * closed Friday from 22:00 through Sunday 21:59; reopens Sunday at 22:00.
 * This is a weekly schedule guard, not a holiday/early-close calendar.
 */
export function getMarketStatus(symbol, now = new Date()) {
  const code = String(symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (CRYPTO.has(code)) return { tradable: true, status: 'OPEN', market: 'CRYPTO', checkedAt: now.toISOString() };
  const market = FX.has(code) ? 'FOREX' : METALS.has(code) ? 'METALS' : 'UNKNOWN';
  if (market === 'UNKNOWN') return { tradable: true, status: 'UNRESTRICTED', market, checkedAt: now.toISOString() };

  const p = zonedParts(now, 'Africa/Ouagadougou');
  const minute = Number(p.hour) * 60 + Number(p.minute);
  const weekday = p.weekday;
  const closed = weekday === 'Sat' ||
    (weekday === 'Fri' && minute >= 22 * 60) ||
    (weekday === 'Sun' && minute < 22 * 60);

  return {
    tradable: !closed,
    status: closed ? 'CLOSED' : 'OPEN',
    market,
    timezone: 'Africa/Ouagadougou',
    schedule: 'Vendredi 22:00 – dimanche 22:00 (heure du Burkina Faso)',
    reason: closed ? 'Marché fermé pour le week-end. Aucune nouvelle analyse ni directive ne peut être générée avant la réouverture.' : null,
    checkedAt: now.toISOString()
  };
}
