import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('le calendrier affiche uniquement le widget TradingView',async()=>{
 const s=await read('news.js'),app=await read('app.js');
 assert.match(s,/embed-widget-events\.js/);
 assert.match(app,/page==='actualites'[\s\S]*?initEconomicCalendar\(\$\('calendarStandalone'\)\)/);
 assert.match(s,/tradingview-widget-container/);
 assert.match(s,/locale:'fr'/);
 assert.match(s,/colorTheme:'dark'/);
 assert.doesNotMatch(s,/fetch\(['"]\/api\/economic-calendar/);
 assert.doesNotMatch(s,/renderCalendarTable|renderFallback/);
});
test('le calendrier TradingView est mondial, sombre et dispose d’un délai de diagnostic/retry',async()=>{
 const s=await read('news.js');
 assert.match(s,/importanceFilter:'-1,0,1'/);
 assert.doesNotMatch(s,/countryFilter:/);
 assert.match(s,/mount\.replaceChildren\(widget\)/);
 assert.match(s,/timer=setTimeout/);
 assert.match(s,/15000/);
 assert.match(s,/retry\.addEventListener\('click',load\)/);
 assert.match(s,/height='min\(760px, 78vh\)'/);
});
test('le calendrier reste séparé du contexte macro',async()=>{const s=await read('news.js');assert.doesNotMatch(s,/api\/macro-context/);});
test('le cache PWA est versionné pour la mise à jour',async()=>{const s=await read('sw.js');assert.match(s,/aurevia-shell-v2\.4\.22/);});
test('aucune route calendrier alternative ne subsiste',async()=>{const s=await read('netlify.toml');assert.doesNotMatch(s,/\/api\/economic-calendar/);});
