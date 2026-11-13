// Routage IA serveur AUREVIA : ordre strict Gemini > Cloudflare > SambaNova > Groq.
// Les délais sont compatibles avec la limite synchrone Netlify (60 s).
const env = (name) => String(process.env[name] || '').trim();
const PROVIDER_TIMEOUT_MS = 8000;
const TOTAL_BUDGET_MS = 35000;

export function configuredAIProviders() {
  const providers = [];
  if (env('GEMINI_API_KEY')) providers.push({
    id: 'gemini', name: 'Gemini', key: env('GEMINI_API_KEY'),
    model: env('GEMINI_MODEL') || 'gemini-3.8-flash',
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
  // Ne jamais renvoyer le corps brut du fournisseur au navigateur.
  // On ne conserve qu'un message court, après suppression des secrets et URL.
  const message = String(payload?.error?.message || payload?.message || bodyText || `HTTP ${status}`)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|authorization|secret)["'\s:=]+[^\s,"'}]+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[provider-url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 180);
  return message || `HTTP ${status}`;
}

function providerErrorCode(status) {
  if (status === 401 || status === 403) return 'AUTH_OR_PERMISSION';
  if (status === 402) return 'BILLING_REQUIRED';
  if (status === 404) return 'MODEL_OR_ENDPOINT_NOT_FOUND';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 429) return 'RATE_LIMIT_OR_QUOTA';
  if (status === 400 || status === 422) return 'INVALID_REQUEST';
  if (status >= 500) return 'PROVIDER_SERVER_ERROR';
  return 'HTTP_ERROR';
}

function providerRequestBody(provider, messages, temperature, max_tokens) {
  const body = { model: provider.model, messages, temperature, stream: false };
  // Groq déprécie max_tokens au profit de max_completion_tokens.
  if (provider.id === 'groq') body.max_completion_tokens = max_tokens;
  else body.max_tokens = max_tokens;
  return body;
}

function logAttempt(attempt) {
  // Aucun secret, corps de requête ou contenu de réponse n'est journalisé.
  console.warn('[AUREVIA AI provider attempt]', JSON.stringify(attempt));
}

export async function runAureviaAI({ messages, temperature = 0.25, max_tokens = 2600 }) {
  const providers = configuredAIProviders();
  const attempts = [];
  const startedAt = Date.now();

  for (const provider of providers) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 900) {
      const skipped = {
        provider: provider.name, status: 0, code: 'BUDGET_EXHAUSTED',
        issue: 'Budget global atteint avant cette tentative', elapsedMs: 0
      };
      attempts.push(skipped);
      logAttempt(skipped);
      break;
    }

    const timeoutMs = Math.max(700, Math.min(PROVIDER_TIMEOUT_MS, remaining - 500));
    const attemptStarted = Date.now();
    try {
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${provider.key}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(providerRequestBody(provider, messages, temperature, max_tokens)),
        signal: AbortSignal.timeout(timeoutMs)
      });
      const bodyText = await response.text();
      let payload = {};
      try { payload = JSON.parse(bodyText); } catch {}

      if (!response.ok) {
        const attempt = {
          provider: provider.name, model: provider.model, status: response.status,
          code: providerErrorCode(response.status),
          issue: safeIssue(response.status, bodyText, payload),
          elapsedMs: Date.now() - attemptStarted, timeoutMs
        };
        attempts.push(attempt);
        logAttempt(attempt);
        continue;
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        const attempt = {
          provider: provider.name, model: provider.model, status: response.status,
          code: 'EMPTY_RESPONSE', issue: 'Réponse vide ou format inattendu',
          elapsedMs: Date.now() - attemptStarted, timeoutMs
        };
        attempts.push(attempt);
        logAttempt(attempt);
        continue;
      }

      let data;
      try { data = parseModelJson(content); }
      catch {
        const attempt = {
          provider: provider.name, model: provider.model, status: response.status,
          code: 'INVALID_JSON', issue: 'Le fournisseur a répondu, mais son JSON est invalide',
          elapsedMs: Date.now() - attemptStarted, timeoutMs
        };
        attempts.push(attempt);
        logAttempt(attempt);
        continue;
      }

      console.info('[AUREVIA AI success]', JSON.stringify({
        provider: provider.name, model: provider.model,
        fallbackDepth: attempts.length, elapsedMs: Date.now() - startedAt,
        attempts: attempts.map(({provider,status,code,elapsedMs}) => ({provider,status,code,elapsedMs}))
      }));
      return { data, provider: provider.name, model: provider.model, attempts };
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      const attempt = {
        provider: provider.name, model: provider.model, status: 0,
        code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        issue: timedOut ? `Délai dépassé après ${timeoutMs} ms` : String(error?.message || 'Erreur réseau').slice(0, 180),
        elapsedMs: Date.now() - attemptStarted, timeoutMs
      };
      attempts.push(attempt);
      logAttempt(attempt);
    }
  }

  const missing = providers.length === 0;
  const elapsedMs = Date.now() - startedAt;
  const summary = {
    configuredProviders: providers.map(({name,model}) => ({name,model})),
    attempts: attempts.map(({provider,model,status,code,issue,elapsedMs,timeoutMs}) =>
      ({provider,model,status,code,issue,elapsedMs,timeoutMs})),
    elapsedMs
  };
  console.error('[AUREVIA AI exhausted]', JSON.stringify(summary));
  throw Object.assign(new Error(missing
    ? 'Aucun fournisseur IA n’est configuré côté serveur.'
    : 'Tous les fournisseurs IA ont échoué. Consultez le diagnostic des tentatives.'), {
    statusCode: missing ? 503 : 502,
    code: missing ? 'AI_NOT_CONFIGURED' : 'AI_ALL_PROVIDERS_FAILED',
    attempts: summary.attempts,
    elapsedMs
  });
}
