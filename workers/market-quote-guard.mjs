import { getMarketStatus } from '../market-hours.js';

const MAX_TICK_AGE_MS = 90_000;
const MAX_FUTURE_SKEW_MS = 5_000;

export function normalizeWebSocketQuote(event, now = Date.now()) {
  const symbol = String(event?.symbol || '').trim().toUpperCase();
  const price = Number(event?.price);
  const timestamp = Number(event?.timestamp);
  if (!symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const quoteMs = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const ageMs = now - quoteMs;
  if (!Number.isFinite(quoteMs) || ageMs > MAX_TICK_AGE_MS || ageMs < -MAX_FUTURE_SKEW_MS) return null;
  return { symbol, price, quoteAt: new Date(quoteMs).toISOString(), ageMs };
}

export function canProcessMarketTick(symbol, now = new Date()) {
  return getMarketStatus(symbol, now).tradable;
}
