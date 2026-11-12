import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('le calendrier visible utilise le widget TradingView historique',async()=>{
 const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
 assert.match(source,/embed-widget-events\.js/);
 assert.match(source,/countryFilter:'us'/);
 assert.match(source,/locale:'fr'/);
 assert.match(source,/colorTheme:'dark'/);
 assert.match(source,/isTransparent:true/);
 assert.match(source,/backgroundColor='#000000'/);
 assert.match(source,/economic-calendar/);
});
test('le flux calendrier structuré reste distinct du widget visuel',async()=>{
 const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
 assert.match(source,/functions\/economic-calendar/);
 assert.match(source,/api\/macro-context/);
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
 assert.match(source,/status:hasOperationalEvidence\?'IDENTIFIED':'WATCH'/);
 assert.match(source,/probability:null/);
 assert.match(source,/probabilityStatus:'NON_CALIBRÉE'/);
});
test('l’interface affiche PLANS CHIFFRÉS lorsque WAIT masque une entrée immédiate',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/\?'PLANS CHIFFRÉS'/);
 assert.match(source,/\['IDENTIFIED','WATCH'\]/);
});
