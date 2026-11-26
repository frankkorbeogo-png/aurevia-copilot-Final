import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('le calendrier économique utilise uniquement le widget TradingView',async()=>{
  const s=await read('news.js'),config=await read('netlify.toml');
  assert.match(s,/embed-widget-events\.js/);
  assert.match(s,/importanceFilter:'-1,0,1'/);
  assert.match(s,/locale:'fr'/);
  assert.match(s,/colorTheme:'dark'/);
  assert.doesNotMatch(s,/fetch\(['"]\/api\/economic-calendar/);
  assert.doesNotMatch(config,/from = "\/api\/economic-calendar"/);
});
test('le démarrage authentifié conserve le montage du calendrier sur la page Actualités',async()=>{
  const s=await read('app.js');
  assert.match(s,/initAuth\(\)\.then\(\(\)=>\{if\(window\.__aureviaAuthenticated&&\['trial','licensed'\]\.includes\(window\.__aureviaLicense\?\.status\)\)bootAuthenticatedApp\(\);\}\)/);
  assert.match(s,/initEconomicCalendar\(\$\('calendarStandalone'\)\)/);
});
