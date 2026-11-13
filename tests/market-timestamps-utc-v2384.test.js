import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const analysisSource=await readFile(new URL('../analysis.js',import.meta.url),'utf8');
const parserStart=analysisSource.indexOf('export function parseProviderTime(');
const parserEnd=analysisSource.indexOf('\n}',parserStart);
const parserSource=analysisSource.slice(parserStart,parserEnd+2);
assert.ok(parserSource,'parseProviderTime doit être exportée pour les tests');
const parseProviderTime=new Function(`${parserSource.replace('export function','function')}; return parseProviderTime;`)();
test('les horodatages ISO avec offset sont interprétés comme des instants absolus',()=>{
  assert.equal(parseProviderTime('2026-11-13T10:00:00Z','UTC'),Date.parse('2026-11-13T10:00:00Z'));
  assert.equal(parseProviderTime('2026-11-13T11:00:00+01:00','UTC'),Date.parse('2026-11-13T10:00:00Z'));
});
test('les horodatages sans fuseau sont refusés au lieu d’être supposés UTC',()=>{
  assert.equal(Number.isNaN(parseProviderTime('2026-11-13 10:00:00',null)),true);
});
test('les heures locales fournisseur sont converties avec leur fuseau déclaré',()=>{
  assert.equal(parseProviderTime('2026-11-13 10:00:00','Africa/Ouagadougou'),Date.parse('2026-11-13T10:00:00Z'));
});
test('le flux Twelve Data demande explicitement des horodatages UTC',async()=>{
  const source=await readFile(new URL('../netlify/functions/market-data.mjs',import.meta.url),'utf8');
  assert.match(source,/searchParams\.set\('timezone','UTC'\)/);
  assert.match(source,/timezone:'UTC'/);
});
