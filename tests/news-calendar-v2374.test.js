import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('TradingView reste la source principale avec repli calendrier AUREVIA authentifié',async()=>{const s=await read('news.js');assert.match(s,/embed-widget-events\.js/);assert.match(s,/importanceFilter:'-1,0,1'/);assert.match(s,/locale:'fr'/);assert.match(s,/colorTheme:'dark'/);assert.match(s,/tradingview\.com\/economic-calendar/);assert.match(s,/fetch\('\/api\/economic-calendar'/);assert.match(s,/renderCalendarTable/);});
test('le calendrier affiché est monté avec un jeton de session pour le repli',async()=>{const html=await read('index.html');const app=await read('app.js');assert.match(html,/id="calendarStandalone"/);assert.match(app,/initEconomicCalendar\(\$\('calendarStandalone'\),getAnalysisAccessToken\)/);});
test('les libellés identifient la source TradingView et ne promettent pas un flux unique',async()=>{const html=await read('index.html');assert.match(html,/Calendrier économique TradingView/);assert.match(html,/ÉVÉNEMENTS &amp; VOLATILITÉ/);});