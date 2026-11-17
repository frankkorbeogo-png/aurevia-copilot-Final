// Fraîcheur de transport alignée sur le cache OHLC serveur.
// La fraîcheur réelle des bougies clôturées est contrôlée séparément par isFresh().
export const MARKET_FETCH_MAX_AGE_MS = Object.freeze({
  '15min': 5 * 60_000,
  '30min': 9 * 60_000,
  '1h': 16 * 60_000,
  '4h': 46 * 60_000
});
export function isMarketFetchFresh(value, interval, now = Date.now()) {
  const stamp = Date.parse(value || '');
  const maxAge = MARKET_FETCH_MAX_AGE_MS[interval];
  if (!Number.isFinite(stamp) || !Number.isFinite(now) || !maxAge) return false;
  const age = now - stamp;
  return age >= -5_000 && age <= maxAge;
}
