import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('TradingView est l’unique source de tous les calendriers économiques affichés',async()=>{const s=await read('news.js');assert.match(s,/embed-widget-events\.js/);assert.match(s,/importanceFilter:'-1,0,1'/);assert.match(s,/locale:'fr'/);assert.match(s,/colorTheme:'dark'/);assert.match(s,/tradingview\.com\/economic-calendar/);assert.doesNotMatch(s,/fetch\(/);assert.doesNotMatch(s,/renderCalendar|calendar-table|calendar-filters/);});
test('les deux emplacements de calendrier utilisent le même widget TradingView',async()=>{const html=await read('index.html');const app=await read('app.js');assert.match(html,/id="calendarWidget"/);assert.match(html,/id="calendarStandalone"/);assert.match(app,/initEconomicCalendar\(\$\('calendarWidget'\)\)/);assert.match(app,/initEconomicCalendar\(\$\('calendarStandalone'\)\)/);assert.doesNotMatch(app,/initEconomicCalendar\([^)]*getAnalysisAccessToken/);});
test('les libellés ne présentent plus de calendrier API secondaire',async()=>{const html=await read('index.html');assert.doesNotMatch(html,/API publique · multi-devises|Publications à surveiller/);assert.match(html,/Calendrier économique TradingView/);});
