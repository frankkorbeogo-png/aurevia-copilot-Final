import test from 'node:test';
import assert from 'node:assert/strict';
import {inferQuoteCurrency,validateFxSnapshot} from '../fx-conversion.js';
import {calculateContractPnl,normalizeContractSpec,validateContractSpec} from '../contract-engine.js';

test('devise de cotation reconnue pour forex, métaux, indices et actions',()=>{
 assert.equal(inferQuoteCurrency('XAU/USD'),'USD');assert.equal(inferQuoteCurrency('EUR/JPY'),'JPY');assert.equal(inferQuoteCurrency('GER40'),'EUR');assert.equal(inferQuoteCurrency('UK100'),'GBP');assert.equal(inferQuoteCurrency('AAPL'),'USD');assert.equal(inferQuoteCurrency('INSTRUMENT-INCONNU'),null);
});
test('un contrat XAU/USD convertit le P/L USD en devise du compte',()=>{
 const spec={accountCurrency:'XOF',quoteCurrency:'USD',calculationType:'contract',contractSize:100,quoteToAccount:600,minLot:0.01,lotStep:0.01,feesPerLot:0};
 assert.equal(validateContractSpec(spec).ok,true);
 const pnl=calculateContractPnl({direction:'BUY',entry:2000,exit:2010,volume:0.05,contractSpec:spec});
 assert.deepEqual(pnl,{gross:30000,fees:0,net:30000,currency:'XOF'});
});
test('même devise : taux égal à 1 et aucune double conversion',()=>{
 const spec={accountCurrency:'USD',quoteCurrency:'USD',calculationType:'contract',contractSize:100,quoteToAccount:1,minLot:0.01,lotStep:0.01};
 assert.equal(calculateContractPnl({direction:'SELL',entry:2000,exit:2010,volume:0.05,contractSpec:spec}).net,-50);
});
test('snapshot FX vérifie les devises, le taux et les métadonnées',()=>{
 const snapshot={from:'USD',to:'XOF',rate:600,fetchedAt:'2026-11-13T12:00:00.000Z',source:'Twelve Data'};
 assert.deepEqual(validateFxSnapshot(snapshot,{from:'USD',to:'XOF'}),snapshot);
 assert.throws(()=>validateFxSnapshot({...snapshot,rate:0},{from:'USD',to:'XOF'}),/indisponible ou invalide/);
 assert.throws(()=>validateFxSnapshot(snapshot,{from:'USD',to:'EUR'}),/indisponible ou invalide/);
});
test('la normalisation conserve la devise de cotation et le snapshot',()=>{
 const normalized=normalizeContractSpec({accountCurrency:'XOF',quoteCurrency:'USD',fxSnapshot:{from:'USD',to:'XOF',rate:600}});
 assert.equal(normalized.quoteCurrency,'USD');assert.equal(normalized.fxSnapshot.rate,600);
});

test('les routes FX sont protégées et le watcher ainsi que Telegram utilisent le moteur FX',async()=>{
 const {readFile}=await import('node:fs/promises');
 const api=await readFile(new URL('../netlify/functions/fx-rate.mjs',import.meta.url),'utf8');
 const watcher=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 const telegram=await readFile(new URL('../netlify/functions/telegram-webhook.mjs',import.meta.url),'utf8');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(api,/verifyBearerUser/);assert.match(api,/assertActiveSession/);
 assert.match(watcher,/getFxSnapshot\(quoteCurrency,storedSpec\.accountCurrency\)/);
 assert.match(telegram,/inferQuoteCurrency\(scenario\.instrument\)/);
 assert.match(app,/\/api\/fx-rate\?from=/);assert.match(app,/validateFxSnapshot/);
});
