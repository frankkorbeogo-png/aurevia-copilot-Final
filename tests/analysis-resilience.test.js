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
test('les erreurs sur H4/H1/M5 ne bloquent pas une lecture technique M30/M15',()=>{
  assert.match(source,/Promise\.allSettled/);
  assert.match(source,/requiredMissing/);
  assert.match(source,/allRequiredAvailable/);
  assert.match(source,/x\.tf==='M15'/);
  assert.match(source,/analyses\.M15\?\.last/);
});
test('les erreurs réseau sont affichées comme indisponibilité et non comme simple signal WAIT',()=>{
  assert.match(source,/Erreur technique pendant l’analyse/);
  assert.match(source,/aucune entrée ne sera proposée sans données valides/i);
});
test('une unité optionnelle périmée est exclue des indicateurs et du déclencheur',()=>{
  assert.match(source,/if\(stale\.includes\(tf\)&&tf!=='M15'\)continue/);
});
