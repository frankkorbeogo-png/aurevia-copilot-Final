import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const providerSource = await readFile(new URL('../netlify/functions/_ai-provider.mjs', import.meta.url), 'utf8');
const analysisSource = await readFile(new URL('../netlify/functions/ai-analysis.mjs', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('../analysis.js', import.meta.url), 'utf8');

test('Gemini conserve le contexte complet et reçoit un plafond de sortie adapté', () => {
  assert.match(providerSource, /provider\.id === 'gemini' \? Math\.min\(max_tokens, 2200\)/);
  assert.match(providerSource, /provider\.id === 'groq' \? \(compact \? compactMessagesForGroq/);
});

test('Cloudflare reçoit un contexte compact multi-timeframe et une sortie plus courte', () => {
  assert.match(providerSource, /compactMessagesForCloudflare/);
  assert.match(providerSource, /provider\.id === 'cloudflare' \? Math\.min\(max_tokens, 1400\)/);
  assert.match(providerSource, /data\.context\.timeframes/);
});

test('Groq garde le contexte initial puis compacte seulement après HTTP 413', () => {
  assert.match(providerSource, /response\.status === 413 && !compactGroqRetry/);
  assert.match(providerSource, /compactMessagesForGroq\(messages\)/);
  assert.match(providerSource, /Math\.min\(max_tokens, 1800\)/);
});

test('l’analyse transmet H4, H1, M30 et M15 sans inventer M5/M1', () => {
  assert.match(clientSource, /timeframes:\{H4:frameBrief\('H4'\),H1:frameBrief\('H1'\),M30:frameBrief\('M30'\),M15:frameBrief\('M15'\)\}/);
  assert.match(analysisSource, /Ne prétends pas que M5\/M1 ont été confirmés/);
  assert.match(analysisSource, /mitigation puis confirmation M5 et M1/);
});
