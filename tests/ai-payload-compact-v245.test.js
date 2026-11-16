import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../netlify/functions/ai-analysis.mjs', import.meta.url), 'utf8');

test('le moteur IA ne transmet que les 40 dernières bougies M15 clôturées', () => {
  assert.match(source, /selectClosedMarketCandles/);
  assert.match(source, /closed\.candles\.slice\(-40\)/);
  assert.match(source, /m15\.candles\.length<60/);
  assert.match(source, /validateLatestClosedCandle/);
});

test('les contextes secondaires sont compactés et la sortie est plafonnée', async () => {
  assert.match(source, /function compactAIContext/);
  assert.match(source, /compactAIContext\(m15\.indicators/);
  assert.match(source, /compactAIContext\(context\.macro/);
  const collaboration = await readFile(new URL('../netlify/functions/ai-collaboration.mjs', import.meta.url), 'utf8');
  assert.match(collaboration, /body\.max_tokens=1500/);
});
