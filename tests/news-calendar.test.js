import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('calendar uses TradingView only with visible retry when unavailable',()=>{
 assert.match(source,/embed-widget-events\.js/);assert.match(source,/script\.onerror/);assert.match(source,/timer=setTimeout/);
 assert.doesNotMatch(source,/\/api\/economic-calendar|renderCalendarTable/);
 assert.match(source,/Ouvrir le calendrier TradingView/);assert.match(source,/retry\.addEventListener\('click',load\)/);
 assert.match(app,/initEconomicCalendar\(\$\('calendarStandalone'\)\)/);
});
test('calendar widget mounts safely in the dedicated host',()=>{
 assert.match(source,/textContent=String\(text\)/);assert.match(html,/id="calendarStandalone"/);
 assert.match(source,/mount\.replaceChildren\(widget\)/);
});
