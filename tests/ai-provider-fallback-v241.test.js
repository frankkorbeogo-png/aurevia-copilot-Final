import test from 'node:test';
import assert from 'node:assert/strict';
import { runAureviaAI } from '../netlify/functions/_ai-provider.mjs';

test('le routeur tente les quatre fournisseurs dans l’ordre et poursuit après timeout/erreur HTTP', async (t) => {
  const keys = ['GEMINI_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','SAMBANOVA_API_KEY','GROQ_API_KEY'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) process.env[k] = `test-${k}`;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url, signal: options.signal});
    if (calls.length === 1) throw Object.assign(new Error('timeout'), {name:'TimeoutError'});
    if (calls.length === 2) return new Response(JSON.stringify({error:{message:'permission denied'}}), {status:403});
    if (calls.length === 3) return new Response(JSON.stringify({choices:[{message:{content:'not json'}}]}), {status:200});
    return new Response(JSON.stringify({choices:[{message:{content:'{"decision":"WAIT"}'}}]}), {status:200});
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const k of keys) previous[k] === undefined ? delete process.env[k] : process.env[k] = previous[k];
  });
  const result = await runAureviaAI({messages:[{role:'user',content:'test'}]});
  assert.deepEqual(calls.map(x => new URL(x.url).hostname), [
    'generativelanguage.googleapis.com','api.cloudflare.com','api.sambanova.ai','api.groq.com'
  ]);
  assert.ok(calls.every(x => x.signal));
  assert.equal(result.provider, 'Groq');
  assert.equal(result.data.decision, 'WAIT');
  assert.deepEqual(result.attempts.map(x => x.code), ['TIMEOUT','AUTH_OR_PERMISSION','INVALID_JSON']);
});

test('le routeur limite chaque tentative et son budget total', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/_ai-provider.mjs', import.meta.url), 'utf8');
  assert.match(source, /PROVIDER_TIMEOUT_MS = 2200/);
  assert.match(source, /TOTAL_BUDGET_MS = 9500/);
  assert.match(source, /BUDGET_EXHAUSTED/);
});
