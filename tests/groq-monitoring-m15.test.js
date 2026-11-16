import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('le worker surveille les scénarios sur M15 puis valide l’entrée exclusivement en M5 après mitigation',async()=>{const s=await read('netlify/functions/scenario-watch.mjs');assert.match(s,/interval='15min'/);assert.match(s,/Bougie M15 clôturée/);assert.match(s,/candles\(s\.instrument,'5min','80'\)/);assert.match(s,/evaluateM5EntryConfirmation\(s\.direction,m5,s\.zone_reached_at\)/);assert.match(s,/VALIDATION M5/);assert.doesNotMatch(s,/api\.groq\.com/);});
test('la sauvegarde IA construit automatiquement la synthèse de surveillance',async()=>{const s=await read('app.js');assert.match(s,/PROPOSITION AUREVIA M15/);assert.match(s,/probabilityRationale/);});
