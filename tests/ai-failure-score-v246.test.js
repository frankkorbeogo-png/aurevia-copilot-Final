import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../analysis.js',import.meta.url),'utf8');
test('un échec fournisseur ne recycle pas le score technique dans la jauge IA',()=>{
  assert.match(source,/const score=aiResult\?/);
  assert.match(source,/scoreSource:aiError\?'none':'ai'/);
  assert.match(source,/analysisStatus:aiError\?'AI_FAILED':'AI_COMPLETED'/);
});
