import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');

test('la surveillance des scénarios ne prend que les instruments du catalogue actif',()=>{
 assert.match(source,/getMarketInstrument/);
 assert.doesNotMatch(source,/'US30'|'NAS100'|'NDX'/);
 assert.match(source,/if\(!market\)\{errors\+\+;continue;\}/);
});

test('la surveillance des scénarios respecte les horaires du marché',()=>{
 assert.match(source,/getMarketStatus/);
 assert.match(source,/if\(!marketStatus\.tradable\)continue/);
});

test('le prix de surveillance provient d’une bougie 1 minute horodatée et fraîche',()=>{
 assert.match(source,/interval','1min'/);
 assert.match(source,/quoteAt/);
 assert.match(source,/age>90000/);
 assert.doesNotMatch(source,/api\.twelvedata\.com\/price/);
});

test('la surveillance partage les cotations persistantes avec trade-watch au lieu de redemander le même cours',()=>{
 assert.match(source,/aurevia_market_quotes\?select=price,quote_at,source/);
 assert.match(source,/aurevia_market_quotes\?on_conflict=symbol/);
 assert.match(source,/storedAge<=90000/);
});
test('les bougies M5/M15 sont mises en cache jusqu’à la prochaine clôture et le quota est temporisé',()=>{
 assert.match(source,/const candleCache=new Map\(\)/);
 assert.match(source,/cached\.lastClosedAt===expectedClosedAt/);
 assert.match(source,/providerCooldownUntil\.set\(apiKey,Date\.now\(\)\+60000\)/);
});
