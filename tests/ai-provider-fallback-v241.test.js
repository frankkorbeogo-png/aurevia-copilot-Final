import test from 'node:test';
import assert from 'node:assert/strict';
import { runAureviaAI } from '../netlify/functions/_ai-provider.mjs';

test('le routeur tente les trois fournisseurs dans l’ordre et poursuit après timeout/erreur HTTP', async (t) => {
  const keys = ['GEMINI_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GROQ_API_KEY'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) process.env[k] = `test-${k}`;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url, signal: options.signal});
    if (calls.length === 1) throw Object.assign(new Error('timeout'), {name:'TimeoutError'});
    if (calls.length === 2) return new Response(JSON.stringify({error:{message:'permission denied'}}), {status:403});
    return new Response(JSON.stringify({choices:[{message:{content:'{"decision":"WAIT"}'}}]}), {status:200});
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const k of keys) previous[k] === undefined ? delete process.env[k] : process.env[k] = previous[k];
  });
  const result = await runAureviaAI({messages:[{role:'user',content:'test'}]});
  assert.deepEqual(calls.map(x => new URL(x.url).hostname), [
    'generativelanguage.googleapis.com','api.cloudflare.com','api.groq.com'
  ]);
  assert.ok(calls.every(x => x.signal));
  assert.equal(result.provider, 'Groq');
  assert.equal(result.data.decision, 'WAIT');
  assert.deepEqual(result.attempts.map(x => x.code), ['TIMEOUT','AUTH_OR_PERMISSION']);
});

test('le routeur limite chaque tentative et son budget total', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/_ai-provider.mjs', import.meta.url), 'utf8');
  assert.match(source, /PROVIDER_TIMEOUT_MS = 8500/);
  assert.match(source, /TOTAL_BUDGET_MS = 32000/);
  assert.match(source, /gemini-3\.8-flash/);
  assert.match(source, /max_completion_tokens/);
  assert.match(source, /BUDGET_EXHAUSTED/);
});

test('les diagnostics détaillent chaque fournisseur sans exposer de secret', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/_ai-provider.mjs', import.meta.url), 'utf8');
  assert.match(source, /AUREVIA AI provider attempt/);
  assert.match(source, /elapsedMs/);
  assert.match(source, /timeoutMs/);
  assert.match(source, /safeIssue/);
  assert.match(source, /Bearer.*redacted/);
});


test('le routeur adapte le paramètre de sortie Groq sans changer les autres fournisseurs', async (t) => {
  const keys = ['GEMINI_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GROQ_API_KEY'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) process.env[k] = `test-${k}`;
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length < 3) return new Response(JSON.stringify({error:{message:'unavailable'}}), {status:503});
    return new Response(JSON.stringify({choices:[{message:{content:'{"decision":"WAIT"}'}}]}), {status:200});
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const k of keys) previous[k] === undefined ? delete process.env[k] : process.env[k] = previous[k];
  });
  await runAureviaAI({messages:[{role:'user',content:'test'}],max_tokens:1234});
  assert.equal(bodies[0].model, 'gemini-3.8-flash');
  assert.equal(bodies[0].max_tokens, 1234);
  assert.equal('max_completion_tokens' in bodies[0], false);
  assert.equal(bodies[2].max_completion_tokens, 1234);
  assert.equal('max_tokens' in bodies[2], false);
});

test('le routeur distingue les erreurs de facturation, modèle absent et charge trop grande', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/_ai-provider.mjs', import.meta.url), 'utf8');
  assert.match(source, /BILLING_REQUIRED/);
  assert.match(source, /MODEL_OR_ENDPOINT_NOT_FOUND/);
  assert.match(source, /PAYLOAD_TOO_LARGE/);
  assert.match(source, /RATE_LIMIT_OR_QUOTA/);
});


test('GPT-OSS Groq limite le raisonnement interne et exige un JSON final exploitable', async (t) => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'test-groq';
  const keys = ['GEMINI_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:[{type:'text',text:'{"decision":"WAIT"}'}]}}]}), {status:200});
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    previous === undefined ? delete process.env.GROQ_API_KEY : process.env.GROQ_API_KEY = previous;
    for (const k of keys) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k];
  });
  const result = await runAureviaAI({messages:[{role:'user',content:'test'}],max_tokens:1800});
  assert.equal(sent.reasoning_effort,'low');
  assert.equal(sent.include_reasoning,false);
  assert.deepEqual(sent.response_format,{type:'json_object'});
  assert.equal(sent.max_completion_tokens,1800);
  assert.equal(result.data.decision,'WAIT');
});

test('SambaNova est retiré du routage et le budget est recalé sur trois fournisseurs', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../netlify/functions/_ai-provider.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SAMBANOVA_API_KEY|api\\.sambanova\\.ai|name: 'SambaNova'/);
  assert.match(source, /TOTAL_BUDGET_MS = 32000/);
});
