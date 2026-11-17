import test from 'node:test';
import assert from 'node:assert/strict';
import {isMarketFetchFresh,MARKET_FETCH_MAX_AGE_MS} from '../market-fetch-freshness.js';

test('une réponse M30 mise en cache pendant sa TTL serveur reste exploitable',()=>{
 const now=Date.UTC(2026,10,17,15,0);
 assert.equal(isMarketFetchFresh(new Date(now-8*60_000).toISOString(),'30min',now),true);
 assert.equal(isMarketFetchFresh(new Date(now-9*60_000-1).toISOString(),'30min',now),false);
});
test('les délais de transport suivent les TTL OHLC serveur avec une marge de sécurité',()=>{
 assert.deepEqual(MARKET_FETCH_MAX_AGE_MS,{
  '15min':5*60_000,'30min':9*60_000,'1h':16*60_000,'4h':46*60_000
 });
});
test('les dates absentes, futures au-delà de la tolérance et intervalles inconnus sont rejetés',()=>{
 const now=Date.UTC(2026,10,17,15,0);
 assert.equal(isMarketFetchFresh(null,'30min',now),false);
 assert.equal(isMarketFetchFresh(new Date(now+6_000).toISOString(),'30min',now),false);
 assert.equal(isMarketFetchFresh(new Date(now).toISOString(),'2h',now),false);
});
