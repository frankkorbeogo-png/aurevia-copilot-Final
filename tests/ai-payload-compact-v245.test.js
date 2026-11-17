import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const clientSource = await readFile(new URL('../analysis.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../netlify/functions/ai-analysis.mjs', import.meta.url), 'utf8');
const collaboration = await readFile(new URL('../netlify/functions/ai-collaboration.mjs', import.meta.url), 'utf8');

test('le navigateur transmet les 250 bougies M15 les plus récentes sans nouvel appel fournisseur', () => {
  assert.match(clientSource, /m15\.candles\.slice\(-250\)/);
  assert.match(clientSource, /outputsize=250/);
  assert.match(clientSource, /m15CandleDiagnostics/);
});

test('le serveur conserve jusqu’à 250 bougies M15 et vérifie leur ordre chronologique', () => {
  assert.match(source, /MAX_M15_CANDLES=250/);
  assert.match(source, /m15\.candles\.slice\(-MAX_M15_CANDLES\)/);
  assert.match(source, /candleHistoryComplete:candles\.length===MAX_M15_CANDLES/);
  assert.match(source, /Date\.parse\(c\.t\)<=Date\.parse\(candles\[i-1\]\.t\)/);
  assert.match(source, /m15\.candles\.length<60/);
});

test('les diagnostics de collaboration indiquent le nombre réellement transmis aux IA', () => {
  assert.match(collaboration, /candleCountM15:Array\.isArray\(market\.candles\)\?market\.candles\.length:0/);
  assert.match(collaboration, /candleHistoryTarget:250/);
  assert.match(collaboration, /inputCandleCountM15:info\.candleCountM15/);
});

test('les contextes secondaires restent compactés et la sortie IA plafonnée', () => {
  assert.match(source, /function compactAIContext/);
  assert.match(source, /compactAIContext\(m15\.indicators/);
  assert.ok(source.includes('compactMacroContext(context.macro'));
  assert.match(collaboration, /body\.max_tokens=1500/);
});
