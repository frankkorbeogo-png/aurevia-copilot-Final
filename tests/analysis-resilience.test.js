import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../analysis.js',import.meta.url),'utf8');
test('les analyses identiques sont mutualisées pour éviter les appels OHLC en double',()=>{
  assert.match(source,/const inFlight=new Map\(\)/);
  assert.match(source,/if\(pending\)return pending/);
  assert.match(source,/inFlight\.set\(symbol,task\)/);
  assert.match(source,/inFlight\.delete\(symbol\)/);
});
test('une réponse 429 déclenche une temporisation locale avant une nouvelle tentative',()=>{
  assert.match(source,/const retryAfter=new Map\(\)/);
  assert.match(source,/ANALYSIS_COOLDOWN_MS=15000/);
  assert.match(source,/if\(r\.status===429\)/);
  assert.match(source,/Temporisation du fournisseur/);
});
