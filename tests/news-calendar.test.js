import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('le calendrier AUREVIA consomme le véritable endpoint JSON public ShowMyTrades',()=>{
 assert.match(source,/https:\/\/showmytrades\.com\/api\/public\/calendar\/v1/);
 assert.match(source,/currency=USD/);assert.match(source,/impact=high%2Cmedium/);assert.match(source,/days=7/);
 assert.doesNotMatch(source,/tradingview\.com\/external-embedding\/embed-widget-events/);
});
test('le calendrier affiche date, impact, précédent, prévision et réel sans injecter le texte distant en HTML',()=>{
 for(const term of ['event.time','event.impact','event.previous','event.forecast','event.actual','textContent'])assert.ok(source.includes(term),`champ absent: ${term}`);
 assert.match(source,/Africa\/Ouagadougou/);
 assert.doesNotMatch(source,/innerHTML\s*=/);
});
test('les deux vues du calendrier sont explicitement identifiées comme alimentées par API',()=>{
 assert.match(html,/API gratuite · USD/);assert.match(html,/API publique · USD/);
});
