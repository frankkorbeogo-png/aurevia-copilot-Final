import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMarketTimestamp,selectClosedMarketCandles,validateLatestClosedCandle} from '../market-candle-validation.js';

function candles(count,start,step=15*60000){
 return Array.from({length:count},(_,i)=>({time:new Date(start+i*step).toISOString(),open:100,high:102,low:99,close:101,volume:10}));
}

test('exclut la bougie M15 encore en formation et conserve les bougies clôturées',()=>{
 const now=Date.UTC(2026,10,16,3,7),rows=candles(35,now-34*15*60000-5*60000);
 const result=selectClosedMarketCandles(rows,'UTC',15,now);
 assert.equal(result.ok,true);
 assert.equal(result.excludedUnclosed,1);
 assert.equal(result.candles.length,34);
 assert.ok(Date.parse(result.candles.at(-1).time)+15*60000<=now);
});

test('refuse les horodatages absents, dupliqués ou désordonnés',()=>{
 const now=Date.UTC(2026,10,16,3,7),rows=candles(32,now-40*15*60000);
 assert.equal(selectClosedMarketCandles([{...rows[0],time:''},...rows.slice(1)],'UTC',15,now).ok,false);
 assert.equal(selectClosedMarketCandles([...rows.slice(0,10),rows[9],...rows.slice(11)],'UTC',15,now).ok,false);
 assert.equal(selectClosedMarketCandles([...rows.slice(1),rows[0]],'UTC',15,now).ok,false);
});

test('ne valide pas une bougie qui n’est pas encore clôturée',()=>{
 const now=Date.UTC(2026,10,16,3,7),rows=candles(1,now-5*60000);
 assert.equal(validateLatestClosedCandle(rows,'UTC',15,{now}).ok,false);
});

test('refuse une dernière bougie clôturée trop ancienne',()=>{
 const now=Date.UTC(2026,10,16,3,7),rows=candles(1,now-90*60000);
 assert.equal(validateLatestClosedCandle(rows,'UTC',15,{now}).ok,false);
});

test('accepte la dernière bougie clôturée récente',()=>{
 const now=Date.UTC(2026,10,16,3,7),rows=candles(1,now-20*60000);
 assert.equal(validateLatestClosedCandle(rows,'UTC',15,{now}).ok,true);
});

test('convertit correctement un timestamp local avec fuseau explicite',()=>{
 const value=parseMarketTimestamp('2026-11-16 10:00:00','Africa/Ouagadougou');
 assert.equal(value,Date.UTC(2026,10,16,10,0,0));
});
