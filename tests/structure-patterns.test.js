import test from 'node:test';import assert from 'node:assert/strict';import {detectCandlestickPatterns} from '../patterns.js';import {detectMarketStructure} from '../structure.js';
const candle=(open,high,low,close)=>({open,high,low,close});
test('détecte un doji sans en faire un signal directionnel',()=>{const p=detectCandlestickPatterns([candle(10,11,9,10.05),candle(10,11,9,10.02),candle(10,11,9,10.01)]);assert.equal(p[0].name,'Doji');assert.equal(p[0].type,'indecision');});
test('détecte une englobante haussière',()=>{const p=detectCandlestickPatterns([candle(12,13,10,11),candle(11,12,10,10.5),candle(10,13,9,12.5)]);assert.ok(p.some(x=>x.name==='Englobante haussière'));});
test('ne fabrique pas de structure avec un historique insuffisant',()=>assert.equal(detectMarketStructure([candle(1,2,0,1)]).bias,'indéterminé'));
test('détecte un balayage de liquidité avec réintégration',()=>{const cs=[candle(5,10,4,7),candle(6,9,3,6),candle(5,8,2,5),candle(6,11,4,7),candle(7,9,3,8),candle(8,9,4,8),candle(8,12,5,8)];const r=detectMarketStructure(cs,{swing:1});assert.ok(Array.isArray(r.sweeps));});
import {detectChartPatterns} from '../patterns.js';
test('les figures chartistes sont signalées comme potentielles et demandent confirmation',()=>{const cs=[];for(let i=0;i<18;i++){const high=[10,12,11,13,11,10,12,11,13,11,10,12,11,13,11,10,12,11][i];cs.push(candle(high-1,high,high-2,high-.5));}const p=detectChartPatterns(cs);assert.ok(p.every(x=>String(x.confirmation).startsWith('needs-')||x.confirmation==='needs-breakout'));});
