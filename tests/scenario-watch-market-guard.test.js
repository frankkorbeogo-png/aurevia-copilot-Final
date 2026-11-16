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
