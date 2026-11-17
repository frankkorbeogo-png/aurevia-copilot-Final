import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('calendar uses TradingView with an authenticated fallback and visible retry',()=>{
 assert.match(source,/embed-widget-events\.js/);assert.match(source,/script\.onerror/);assert.match(source,/\/api\/economic-calendar/);
 assert.match(source,/renderCalendarTable/);assert.match(source,/Ouvrir le calendrier TradingView/);assert.match(app,/initEconomicCalendar\(\$\('calendarStandalone'\),getAnalysisAccessToken\)/);
});
test('calendar fallback creates a safe table using textContent',()=>{
 assert.match(source,/el\('table'/);assert.match(source,/textContent=String\(text\)/);assert.match(html,/id="calendarStandalone"/);
});
