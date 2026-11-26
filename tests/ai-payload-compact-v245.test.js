import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../netlify/functions/ai-analysis.mjs', import.meta.url), 'utf8');
test('le moteur IA exige et conserve exactement 250 bougies M30 clôturées', () => {
  assert.match(source, /primary\.candles\.length!==250/);
  assert.match(source, /const candles=primary\.candles\.map\(c=>/);
  assert.doesNotMatch(source, /primary\.candles\.slice\(-40\)/);
  assert.match(source, /candleHistoryTarget:250/);
});
test('les contextes secondaires sont compactés et la sortie IA est plafonnée', async () => {
  assert.match(source, /function compactAIContext/);
  assert.match(source, /compactAIContext\(primary\.indicators/);
  assert.ok(source.includes('compactMacroContext(context.macro'));
  const collaboration = await readFile(new URL('../netlify/functions/ai-collaboration.mjs', import.meta.url), 'utf8');
  assert.match(collaboration, /body\.max_tokens=aggressive\?1200:1600/);
});
test('le client charge 251 bougies M30 pour conserver 250 clôturées et transmet exactement 250 au serveur', async () => {
  const client = await readFile(new URL('../analysis.js', import.meta.url), 'utf8');
  assert.match(client, /fetchFrame\(pair,FRAMES\.M30,251\)/);
  assert.match(client, /primary\.candles\.slice\(-250\)/);
});
