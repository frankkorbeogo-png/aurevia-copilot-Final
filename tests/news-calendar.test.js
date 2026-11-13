import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../news.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('tous les calendriers économiques utilisent directement le widget TradingView',()=>{assert.match(source,/embed-widget-events\.js/);assert.match(source,/colorTheme:'dark'/);assert.match(source,/locale:'fr'/);assert.match(source,/importanceFilter:'-1,0,1'/);assert.doesNotMatch(source,/fetch\(|renderCalendar|calendar-table/);});
test('le widget donne accès à la source TradingView et utilise un fond sombre',()=>{assert.match(source,/tradingview-widget-copyright/);assert.match(source,/tradingview\.com\/economic-calendar/);assert.match(source,/isTransparent:false/);});
test('les deux zones affichées utilisent le même initialiseur TradingView',()=>{assert.match(html,/id="calendarWidget"/);assert.match(html,/id="calendarStandalone"/);assert.match(app,/initEconomicCalendar\(\$\('calendarWidget'\)\)/);assert.match(app,/initEconomicCalendar\(\$\('calendarStandalone'\)\)/);});
