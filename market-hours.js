const FX = new Set(['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY']);
const METALS = new Set(['XAUUSD','XAGUSD']);
const CRYPTO = new Set(['BTCUSD','ETHUSD','SOLUSD','XRPUSD']);

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}
function newYorkParts(date) { return zonedParts(date, 'America/New_York'); }
function wallClockInstant(year, month, day, hour, minute, timeZone) {
  const target=Date.UTC(year,month-1,day,hour,minute); let guess=target;
  for(let i=0;i<4;i++){const p=zonedParts(new Date(guess),timeZone);const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));guess+=target-represented;}
  return new Date(guess);
}
function burkinaSessionSchedule(now) {
  const ny=newYorkParts(now), index=({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6})[ny.weekday];
  const base=new Date(Date.UTC(Number(ny.year),Number(ny.month)-1,Number(ny.day)));
  const sunday=new Date(base), friday=new Date(base);
  sunday.setUTCDate(sunday.getUTCDate()+((7-index)%7)); friday.setUTCDate(friday.getUTCDate()+((5-index+7)%7));
  const open=wallClockInstant(sunday.getUTCFullYear(),sunday.getUTCMonth()+1,sunday.getUTCDate(),17,0,'America/New_York');
  const close=wallClockInstant(friday.getUTCFullYear(),friday.getUTCMonth()+1,friday.getUTCDate(),17,0,'America/New_York');
  const fmt=d=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Ouagadougou',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
  return `Dimanche ${fmt(open)} – vendredi ${fmt(close)} (heure du Burkina Faso)`;
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
    timezone: 'Africa/Ouagadougou',
    schedule: burkinaSessionSchedule(now),
    reason: closed ? 'Marché fermé pour le week-end. Aucune nouvelle analyse ni directive ne peut être générée avant la réouverture.' : null,
    checkedAt: now.toISOString()
  };
}
