import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../netlify/functions/market-data.mjs',import.meta.url),'utf8');
test('le flux OHLC effectue une nouvelle tentative et limite la durée des requêtes fournisseur',()=>{
 assert.match(source,/attempt<2/);assert.match(source,/AbortSignal\.timeout\(9000\)/);
});
test('un cache OHLC récent peut servir de repli avec un marqueur de fraîcheur explicite',()=>{
 assert.match(source,/CACHE_STALE_MAX_MS=5\*60\*1000/);
 assert.match(source,/stale:true/);assert.match(source,/staleAgeSeconds/);
});
test('le cache périmé ne masque pas une panne sans historique valide',()=>{
 assert.match(source,/Aucune réponse exploitable du fournisseur/);
 assert.match(source,/retryable:true/);
});
