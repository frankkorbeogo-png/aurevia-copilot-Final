import test from 'node:test';import assert from 'node:assert/strict';import {ema,rsi,bollinger,atr,calculateIndicators} from '../indicators.js';
test('EMA retourne une valeur seulement avec assez de points',()=>{assert.equal(ema([1,2],3),null);assert.equal(ema([1,2,3],3),2);});
test('RSI gère une série haussière sans pertes',()=>assert.equal(rsi(Array.from({length:20},(_,i)=>i+1)),100));
test('Bollinger fournit bande haute, médiane et basse',()=>{const b=bollinger(Array.from({length:20},(_,i)=>i+1));assert.ok(b.upper>b.middle&&b.middle>b.lower);});
test('ATR et ensemble indicateurs restent indisponibles sans historique suffisant',()=>{const cs=Array.from({length:10},(_,i)=>({open:i+1,high:i+2,low:i,close:i+1.5}));assert.equal(atr(cs),null);assert.equal(calculateIndicators(cs).ema200,null);});
