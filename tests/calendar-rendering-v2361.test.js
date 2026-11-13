import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('le calendrier affiche TradingView directement sans attendre un endpoint tiers',async()=>{
 const s=await read('news.js');
 assert.match(s,/embed-widget-events\.js/);
 assert.match(s,/renderTradingView|tradingview-widget-container/);
 assert.match(s,/locale:'fr'/);
 assert.match(s,/colorTheme:'dark'/);
 assert.doesNotMatch(s,/fetch\(/);
 assert.doesNotMatch(s,/renderCalendar\(container,payload\)/);
});
test('le calendrier TradingView est mondial et visible dès son montage',async()=>{
 const s=await read('news.js');
 assert.match(s,/importanceFilter:'-1,0,1'/);
 assert.doesNotMatch(s,/countryFilter:/);
 assert.match(s,/mount\.replaceChildren\(widget\)/);
 assert.match(s,/height='min\(760px, 78vh\)'/);
});
test('le calendrier reste séparé du contexte macro',async()=>{
 const s=await read('news.js');assert.doesNotMatch(s,/api\/macro-context/);
});
test('le cache PWA est versionné pour la mise à jour',async()=>{const s=await read('sw.js');assert.match(s,/aurevia-shell-v2\.3\.82/);});
test('la route API publique peut rester présente sans être requise par le widget',async()=>{const s=await read('netlify.toml');assert.match(s,/from = "\/api\/economic-calendar"[\s\S]*?to = "\/.netlify\/functions\/economic-calendar"/);});
