import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('TradingView est l’unique source du calendrier économique',async()=>{
 const s=await read('news.js'),config=await read('netlify.toml');
 assert.match(s,/embed-widget-events\.js/);assert.match(s,/importanceFilter:'-1,0,1'/);assert.match(s,/locale:'fr'/);assert.match(s,/colorTheme:'dark'/);assert.match(s,/tradingview\.com\/economic-calendar/);
 assert.doesNotMatch(s,/fetch\(['"]\/api\/economic-calendar/);assert.doesNotMatch(config,/\/api\/economic-calendar/);
});
test('le calendrier est monté sans jeton ni fournisseur de secours',async()=>{
 const html=await read('index.html'),app=await read('app.js');
 assert.match(html,/id="calendarStandalone"/);assert.match(app,/initEconomicCalendar\(\$\('calendarStandalone'\)\)/);
 assert.doesNotMatch(app,/initEconomicCalendar\(\$\('calendarStandalone'\),getAnalysisAccessToken\)/);
});
test('les libellés identifient la source TradingView',async()=>{
 const html=await read('index.html');assert.match(html,/Calendrier économique TradingView/);assert.match(html,/ÉVÉNEMENTS &amp; VOLATILITÉ/);
});
