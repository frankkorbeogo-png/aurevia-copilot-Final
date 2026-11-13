import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('l’interface remonte les diagnostics individuels du routeur IA', async()=>{
  const source=await readFile(new URL('../analysis.js',import.meta.url),'utf8');
  assert.match(source,/providerDiagnostics\?\.attempts/);
  assert.match(source,/a\.provider/);
  assert.match(source,/a\.status/);
  assert.match(source,/a\.code/);
  assert.match(source,/a\.elapsedMs/);
  assert.match(source,/a\.issue/);
  assert.match(source,/Diagnostic fournisseurs/);
});
