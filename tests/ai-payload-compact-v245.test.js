import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../netlify/functions/ai-analysis.mjs', import.meta.url), 'utf8');

test('le moteur IA limite les bougies transmises aux 64 M15 les plus récentes', () => {
  assert.match(source, /m15\.candles\.slice\(-64\)/);
  assert.match(source, /m15\.candles\.length<60/);
});

test('les contextes secondaires sont compactés et la sortie est plafonnée', () => {
  assert.match(source, /function compactAIContext/);
  assert.match(source, /compactAIContext\(m15\.indicators/);
  assert.match(source, /compactAIContext\(context\.macro/);
  assert.match(source, /max_tokens:1400/);
});
