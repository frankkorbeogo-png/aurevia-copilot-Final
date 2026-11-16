import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMarketQuote} from '../market-quote-validation.js';

const base=now=>({price:2500,asOf:new Date(now-30000).toISOString(),fetchedAt:new Date(now-10000).toISOString(),freshness:'recent',stale:false});

test('accepte une cotation récente et horodatée',()=>{
 const now=Date.now(),result=validateMarketQuote(base(now),{now});
 assert.equal(result.ok,true);assert.equal(result.price,2500);
});

test('refuse une cotation dont le timestamp est inconnu',()=>{
 const now=Date.now(),q={...base(now),asOf:null,freshness:'unknown'};
 assert.equal(validateMarketQuote(q,{now}).ok,false);
});

test('refuse une cotation ancienne même si elle vient d’être récupérée',()=>{
 const now=Date.now(),q={...base(now),asOf:new Date(now-10*60*1000).toISOString(),freshness:'stale'};
 assert.equal(validateMarketQuote(q,{now}).ok,false);
});

test('refuse un cache signalé comme périmé',()=>{
 const now=Date.now(),q={...base(now),stale:true};
 assert.equal(validateMarketQuote(q,{now}).ok,false);
});

test('refuse une cotation fraîche en fournisseur mais récupérée hors délai autorisé',()=>{
 const now=Date.now(),q={...base(now),fetchedAt:new Date(now-60000).toISOString()};
 assert.equal(validateMarketQuote(q,{now,maxFetchedAgeMs:45000}).ok,false);
});

test('refuse un prix nul ou invalide',()=>{
 const now=Date.now(),q={...base(now),price:0};
 assert.equal(validateMarketQuote(q,{now}).ok,false);
});
