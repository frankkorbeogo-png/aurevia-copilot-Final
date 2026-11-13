// Routage IA serveur AUREVIA : ordre strict Gemini > Cloudflare > SambaNova > Groq.
const env = (name) => String(process.env[name] || '').trim();

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

export async function runAureviaAI({ messages, temperature = 0.25, max_tokens = 2600 }) {
  const providers = configuredAIProviders();
  const attempts = [];
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${provider.key}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: provider.model, messages, temperature, max_tokens, stream: false
        }),
        signal: AbortSignal.timeout(11000)
      });
      const bodyText = await response.text();
      let payload = {};
      try { payload = JSON.parse(bodyText); } catch {}
      if (!response.ok) {
        const detail = String(payload?.error?.message || payload?.message || bodyText || `HTTP ${response.status}`).slice(0, 450);
        attempts.push({ provider: provider.name, status: response.status, issue: detail });
        console.warn('[AUREVIA AI fallback]', JSON.stringify({ provider: provider.name, status: response.status, detail }));
        continue;
      }
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        attempts.push({ provider: provider.name, status: response.status, issue: 'Réponse vide' });
        continue;
      }
      let data;
      try { data = parseModelJson(content); }
      catch {
        attempts.push({ provider: provider.name, status: response.status, issue: 'JSON invalide' });
        console.warn('[AUREVIA AI fallback]', JSON.stringify({ provider: provider.name, issue: 'invalid_json' }));
        continue;
      }
      console.info('[AUREVIA AI]', JSON.stringify({
        provider: provider.name, model: provider.model,
        fallbackDepth: attempts.length
      }));
      return { data, provider: provider.name, model: provider.model, attempts };
    } catch (error) {
      const detail = String(error?.message || error || 'Erreur réseau').slice(0, 350);
      attempts.push({ provider: provider.name, status: 0, issue: detail });
      console.warn('[AUREVIA AI fallback]', JSON.stringify({
        provider: provider.name, issue: error?.name || 'network', detail
      }));
    }
  }
  const missing = providers.length === 0;
  throw Object.assign(new Error(missing
    ? 'Aucun fournisseur IA n’est configuré côté serveur.'
    : 'Tous les moteurs IA sont momentanément indisponibles.'), {
    statusCode: missing ? 503 : 502,
    code: missing ? 'AI_NOT_CONFIGURED' : 'AI_ALL_PROVIDERS_FAILED',
    attempts
  });
}
