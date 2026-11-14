import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('le worker surveille et confirme les scénarios sur bougies M15, sans appel Groq',async()=>{const s=await read('netlify/functions/scenario-watch.mjs');assert.match(s,/interval','15min'/);assert.match(s,/Bougie M15 clôturée/);assert.match(s,/CONFIRMATION M15/);assert.doesNotMatch(s,/api\\.groq\\.com/);});
test('la sauvegarde IA construit automatiquement la synthèse de surveillance',async()=>{const s=await read('app.js');assert.match(s,/PROPOSITION AUREVIA M15/);assert.match(s,/probabilityRationale/);});
