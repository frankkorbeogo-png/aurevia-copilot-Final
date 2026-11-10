import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFixedRangeVolumeProfile } from '../volume-profile.js';
import { calculateFibonacciRetracements } from '../fibonacci.js';
test('Volume Profile estime POC et zone de valeur depuis OHLCV',()=>{const candles=Array.from({length:20},(_,i)=>({low:100+i,high:104+i,close:102+i,volume:i===10?1000:10}));const p=calculateFixedRangeVolumeProfile(candles);assert.ok(p);assert.ok(p.poc>=p.rangeLow&&p.poc<=p.rangeHigh);assert.ok(p.val<=p.poc&&p.vah>=p.poc);assert.equal(p.method,'OHLCV approximation');});
test('Volume Profile reste indisponible si les volumes sont absents',()=>{const candles=Array.from({length:20},(_,i)=>({low:100+i,high:104+i,close:102+i,volume:null}));assert.equal(calculateFixedRangeVolumeProfile(candles),null);});
test('Fibonacci calcule les retracements d’un swing confirmé',()=>{const f=calculateFibonacciRetracements([{type:'low',price:100,index:1},{type:'high',price:200,index:2}],'haussier');assert.equal(f.levels.length,3);assert.equal(f.levels[1].price,150);});
test('Fibonacci ne fabrique pas de niveaux sans deux extrêmes',()=>assert.equal(calculateFibonacciRetracements([{type:'high',price:200}]),null));

test('Fibonacci haussier choisit un creux antérieur au dernier sommet',()=>{const f=calculateFibonacciRetracements([{type:'low',price:90,index:1},{type:'high',price:180,index:2},{type:'low',price:120,index:3},{type:'high',price:200,index:4}],'haussier');assert.equal(f.low,120);assert.equal(f.high,200);});
test('Fibonacci baissier choisit un sommet antérieur au dernier creux',()=>{const f=calculateFibonacciRetracements([{type:'high',price:220,index:1},{type:'low',price:140,index:2},{type:'high',price:190,index:3},{type:'low',price:100,index:4}],'baissier');assert.equal(f.high,190);assert.equal(f.low,100);});
