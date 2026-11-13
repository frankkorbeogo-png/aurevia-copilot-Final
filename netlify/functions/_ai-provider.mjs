// Routage IA serveur AUREVIA : ordre strict Gemini > Cloudflare > SambaNova > Groq.
// Budget court pour rester sous les limites d'exécution des fonctions synchrones.
const env = (name) => String(process.env[name] || '').trim();
const PROVIDER_TIMEOUT_MS = 2200;
const TOTAL_BUDGET_MS = 9500;

export function configuredAIProviders() {
  const providers = [];
  if (env('GEMINI_API_KEY')) providers.push({
    id: 'gemini', name: 'Gemini', key: env('GEMINI_API_KEY'),
    model: env('GEMINI_MODEL') || 'gemini-2.5-flash',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  });
  if (env('CLOUDFLARE_API_TOKEN') && env('CLOUDFLARE_ACCOUNT_ID')) providers.push({
    id: 'cloudflare', name: 'Cloudflare', key: env('CLOUDFLARE_API_TOKEN'),
    model: env('CLOUDFLARE_MODEL') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    url: `https://api.cloudflare.com/client/v4/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}/ai/v1/chat/completions`
  });
  if (env('SAMBANOVA_API_KEY')) providers.push({
    id: 'sambanova', name: 'SambaNova', key: env('SAMBANOVA_API_KEY'),
    model: env('SAMBANOVA_MODEL') || 'DeepSeek-V3.1',
    url: 'https://api.sambanova.ai/v1/chat/completions'
  });
  if (env('GROQ_API_KEY')) providers.push({
    id: 'groq', name: 'Groq', key: env('GROQ_API_KEY'),
    model: env('GROQ_MODEL') || 'openai/gpt-oss-120b',
    url: 'https://api.groq.com/openai/v1/chat/completions'
  });
  return providers;
}

function parseModelJson(content) {
  const raw = String(content || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(raw);
}

function safeIssue(status, bodyText, payload) {
  const message = String(payload?.error?.message || payload?.message || bodyText || `HTTP ${status}`)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|authorization)["'\s:=]+[^\s,"'}]+/gi, '$1=[redacted]')
    .slice(0, 450);
  return message || `HTTP ${status}`;
}

export async function runAureviaAI({ messages, temperature = 0.25, max_tokens = 2600 }) {
  const providers = configuredAIProviders();
  const attempts = [];
  const startedAt = Date.now();

  for (const provider of providers) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 450) {
      attempts.push({ provider: provider.name, status: 0, issue: 'Budget global atteint avant cette tentative', code: 'BUDGET_EXHAUSTED' });
      break;
    }
    const timeoutMs = Math.max(350, Math.min(PROVIDER_TIMEOUT_MS, remaining - 250));
    try {
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${provider.key}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: provider.model, messages, temperature, max_tokens, stream: false }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      const bodyText = await response.text();
      let payload = {};
      try { payload = JSON.parse(bodyText); } catch {}
      if (!response.ok) {
        const issue = safeIssue(response.status, bodyText, payload);
        attempts.push({ provider: provider.name, status: response.status, issue, code: response.status === 429 ? 'QUOTA_OR_RATE_LIMIT' : response.status === 401 || response.status === 403 ? 'AUTH_OR_PERMISSION' : 'HTTP_ERROR' });
        console.warn('[AUREVIA AI fallback]', JSON.stringify({ provider: provider.name, status: response.status, issue }));
        continue;
      }
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        attempts.push({ provider: provider.name, status: response.status, issue: 'Réponse vide', code: 'EMPTY_RESPONSE' });
        continue;
      }
      let data;
      try { data = parseModelJson(content); }
      catch {
        attempts.push({ provider: provider.name, status: response.status, issue: 'JSON invalide', code: 'INVALID_JSON' });
        console.warn('[AUREVIA AI fallback]', JSON.stringify({ provider: provider.name, issue: 'invalid_json' }));
        continue;
      }
      console.info('[AUREVIA AI success]', JSON.stringify({
        provider: provider.name, model: provider.model,
        fallbackDepth: attempts.length, elapsedMs: Date.now() - startedAt
      }));
      return { data, provider: provider.name, model: provider.model, attempts };
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      const issue = timedOut ? `Délai dépassé (${timeoutMs} ms)` : String(error?.message || error || 'Erreur réseau').slice(0, 180);
      attempts.push({ provider: provider.name, status: 0, issue, code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR' });
      console.warn('[AUREVIA AI fallback]', JSON.stringify({ provider: provider.name, issue, code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR' }));
    }
  }

  const missing = providers.length === 0;
  console.error('[AUREVIA AI exhausted]', JSON.stringify({
    configuredProviders: providers.map(({ name, model }) => ({ name, model })),
    attempts, elapsedMs: Date.now() - startedAt
  }));
  throw Object.assign(new Error(missing
    ? 'Aucun fournisseur IA n’est configuré côté serveur.'
    : 'Les fournisseurs IA n’ont pas répondu dans le délai autorisé. Réessayez dans quelques instants.'), {
    statusCode: missing ? 503 : 502,
    code: missing ? 'AI_NOT_CONFIGURED' : 'AI_ALL_PROVIDERS_FAILED',
    attempts
  });
}
