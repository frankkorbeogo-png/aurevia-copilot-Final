import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('le calendrier visible utilise TradingView en français et en thème sombre sans filtre pays',async()=>{
 const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
 assert.match(source,/embed-widget-events\.js/);
 assert.match(source,/locale:'fr'/);
 assert.match(source,/colorTheme:'dark'/);
 assert.doesNotMatch(source,/countryFilter:/);
 assert.match(source,/backgroundColor='#000000'/);
 assert.match(source,/economic-calendar/);
});
test('le calendrier principal est un widget TradingView autonome, distinct du contexte macro',async()=>{
 const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
 assert.match(source,/embed-widget-events\.js/);
 assert.doesNotMatch(source,/api\/macro-context/);
 assert.doesNotMatch(source,/fetch\('\/api\/economic-calendar'/);
});
test('la reconnexion Telegram réactive les commandes après une déliaison',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/generate\.disabled=true/);
 assert.match(source,/loadTelegramPreferences\(\)/);
 assert.match(source,/save\.disabled=false/);
 assert.match(source,/test\.disabled=false/);
});
test('les plans indicatifs restent distincts des scénarios identifiés et des probabilités',async()=>{
 const source=await readFile(new URL('../opportunity-engine.js',import.meta.url),'utf8');
 assert.match(source,/status=identified&&validOrder\?'IDENTIFIED':'WATCH'/);
 assert.match(source,/probability:null/);
 assert.match(source,/probabilityStatus:'NON_CALIBRÉE'/);
});
test('l’interface affiche PLANS CHIFFRÉS lorsque WAIT masque une entrée immédiate',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/\?'PLANS CHIFFRÉS'/);
 assert.match(source,/\['IDENTIFIED','WATCH'\]/);
});
