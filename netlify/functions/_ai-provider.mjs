// Routage IA serveur AUREVIA : Groq en principal, Cloudflare en secours.
// Les délais restent compatibles avec la limite synchrone Netlify (60 s).
const env = (name) => String(process.env[name] || '').trim();
const PROVIDER_TIMEOUT_MS = 9000;
const TOTAL_BUDGET_MS = 18000;
const PROVIDER_TIMEOUTS = { groq: 7000, cloudflare: 9000 };

export function configuredAIProviders() {
  const providers = [];
  if (env('GROQ_API_KEY')) providers.push({
    id: 'groq', name: 'Groq', key: env('GROQ_API_KEY'),
    model: env('GROQ_MODEL') || 'openai/gpt-oss-120b',
    url: 'https://api.groq.com/openai/v1/chat/completions'
  });
  if (env('CLOUDFLARE_API_TOKEN') && env('CLOUDFLARE_ACCOUNT_ID')) providers.push({
    id: 'cloudflare', name: 'Cloudflare', key: env('CLOUDFLARE_API_TOKEN'),
    model: env('CLOUDFLARE_MODEL') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    url: `https://api.cloudflare.com/client/v4/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}/ai/v1/chat/completions`
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

function compactMessagesForGroq(messages) {
  // Groq peut refuser les requêtes trop volumineuses (HTTP 413). On garde
  // le prompt système et les données décisionnelles, mais on réduit le détail.
  return messages.map((message, index) => {
    const content = String(message?.content || '');
    if (index === 0 || message?.role === 'system') return { ...message, content: content.slice(0, 8500) };
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data.candles)) data.candles = data.candles.slice(-20);
      if (Array.isArray(data.patterns)) data.patterns = data.patterns.slice(-4);
      for (const key of ['indicators', 'structure', 'volumeProfile', 'fibonacci']) {
        if (data[key] && typeof data[key] === 'object') {
          const entries = Object.entries(data[key]).slice(0, 12);
          data[key] = Object.fromEntries(entries);
        }
      }
      if (data.context) {
        data.context = {
          timeframes: data.context.timeframes || {},
          macro: typeof data.context.macro === 'string' ? data.context.macro.slice(0, 500) : (data.context.macro && typeof data.context.macro === 'object' ? {configured:data.context.macro.configured,notice:data.context.macro.notice} : data.context.macro)
        };
      }
      return { ...message, content: JSON.stringify(data) };
    } catch {
      return { ...message, content: content.slice(0, 12000) };
    }
  });
}

function compactMessagesForCloudflare(messages) {
  // Llama sur Workers reçoit un contexte intermédiaire : assez riche pour
  // comparer les unités, mais sans historique OHLC exhaustif ni macro verbeuse.
  return messages.map((message, index) => {
    const content = String(message?.content || '');
    if (message?.role === 'system') return { ...message, content: content.slice(0, 10500) };
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data.candles)) data.candles = data.candles.slice(-24);
      if (Array.isArray(data.patterns)) data.patterns = data.patterns.slice(-5);
      if (data.context?.timeframes) {
        for (const [tf, frame] of Object.entries(data.context.timeframes)) {
          if (frame && typeof frame === 'object') {
            data.context.timeframes[tf] = { available: frame.available, bias: frame.bias, ema20: frame.ema20, ema50: frame.ema50, ema200: frame.ema200, rsi14: frame.rsi14, breaks: (frame.breaks || []).slice(-2), sweeps: (frame.sweeps || []).slice(-1) };
          }
        }
      }
      if (data.context?.macro && typeof data.context.macro === 'object') data.context.macro = { configured: data.context.macro.configured, notice: data.context.macro.notice };
      return { ...message, content: JSON.stringify(data).slice(0, 18000) };
    } catch { return { ...message, content: content.slice(0, index === 0 ? 10500 : 14000) }; }
  });
}

function providerRequestBody(provider, messages, temperature, max_tokens, compact = false) {
  const selectedMessages = provider.id === 'groq' ? (compact ? compactMessagesForGroq(messages) : messages) : provider.id === 'cloudflare' ? compactMessagesForCloudflare(messages) : messages;
  const providerOutputLimit = provider.id === 'cloudflare' ? Math.min(max_tokens, 1400) : Math.min(max_tokens, 1800);
  const body = { model: provider.model, messages: selectedMessages, temperature, stream: false };
  // Groq déprécie max_tokens au profit de max_completion_tokens.
  if (provider.id === 'groq') {
    body.max_completion_tokens = providerOutputLimit;
    // GPT-OSS peut consommer le budget de sortie dans son raisonnement interne
    // et retourner HTTP 200 avec message.content vide. Réduire l'effort
    // et demander explicitement une réponse JSON exploitable.
    if (provider.model.startsWith('openai/gpt-oss-')) {
      body.reasoning_effort = 'low';
      body.include_reasoning = false;
      body.response_format = { type: 'json_object' };
    }
  } else body.max_tokens = providerOutputLimit;
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

    const providerLimit = PROVIDER_TIMEOUTS[provider.id] || PROVIDER_TIMEOUT_MS;
    const timeoutMs = Math.max(700, Math.min(providerLimit, remaining - 500));
    const attemptStarted = Date.now();
    try {
      let response;
      let bodyText = '';
      let payload = {};
      let compactGroqRetry = false;
      for (let requestNo = 0; requestNo < 2; requestNo++) {
        const compact = provider.id === 'groq' && compactGroqRetry;
        const requestBody = JSON.stringify(providerRequestBody(provider, messages, temperature, max_tokens, compact));
        response = await fetch(provider.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${provider.key}`,
            'content-type': 'application/json'
          },
          body: requestBody,
          signal: AbortSignal.timeout(timeoutMs)
        });
        bodyText = await response.text();
        payload = {};
        try { payload = JSON.parse(bodyText); } catch {}
        if (provider.id === 'groq' && response.status === 413 && !compactGroqRetry) {
          compactGroqRetry = true;
          continue;
        }
        break;
      }

      if (!response.ok) {
        const attempt = {
          provider: provider.name, model: provider.model, status: response.status,
          code: providerErrorCode(response.status),
          issue: safeIssue(response.status, bodyText, payload),
          elapsedMs: Date.now() - attemptStarted, timeoutMs, compactRetry: compactGroqRetry
        };
        attempts.push(attempt);
        logAttempt(attempt);
        continue;
      }

      const message = payload?.choices?.[0]?.message;
      const rawContent = message?.content;
      const content = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map(part => typeof part === 'string' ? part : (part?.text || '')).join('\\n')
          : '';
      if (!content.trim()) {
        const finishReason = String(payload?.choices?.[0]?.finish_reason || 'unknown');
        const attempt = {
          provider: provider.name, model: provider.model, status: response.status,
          code: finishReason === 'length' ? 'OUTPUT_BUDGET_EXHAUSTED' : 'EMPTY_RESPONSE',
          issue: finishReason === 'length'
            ? 'Budget de sortie épuisé avant le JSON final'
            : `HTTP 200 sans texte exploitable (finish_reason: ${finishReason})`,
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
