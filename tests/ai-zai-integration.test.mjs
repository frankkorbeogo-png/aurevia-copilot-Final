import test from 'node:test';
import assert from 'node:assert/strict';

const envKeys = [
  'GEMINI_API_KEY','OPENROUTER_API_KEY','CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID','GROQ_API_KEY','ZAI_API_KEY','ZAI_MODEL'
];
const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
for (const [key, value] of Object.entries({
  GEMINI_API_KEY:'test-gemini-key',
  OPENROUTER_API_KEY:'test-openrouter-key',
  CLOUDFLARE_API_TOKEN:'test-cloudflare-token',
  CLOUDFLARE_ACCOUNT_ID:'test-account',
  GROQ_API_KEY:'test-groq-key',
  ZAI_API_KEY:'test-zai-key',
  // Even if configured, the integration must not switch to a paid model.
  ZAI_MODEL:'glm-5.3'
})) process.env[key] = value;

const { configuredAIProviders } = await import('../netlify/functions/_ai-provider.mjs');
const { runAureviaCollaboration } = await import('../netlify/functions/ai-collaboration.mjs');

test('Z.ai is fixed to the free GLM-4.7-Flash model and receives the same 250 M30 candles', async () => {
  const providers = configuredAIProviders();
  const zai = providers.find(provider => provider.id === 'zai');
  assert.ok(zai, 'Z.ai provider should be registered from ZAI_API_KEY');
  assert.equal(zai.model, 'GLM-4.7-Flash');
  assert.equal(zai.url, 'https://api.z.ai/api/paas/v4/chat/completions');

  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), model: body.model, messages: body.messages });
    const isCloudflare = String(url).includes('api.cloudflare.com');
    const answer = {
      decision: 'BUY',
      verdict: 'CONFIRME',
      summary: 'Mock independent review',
      marketReading: 'Mock M30 reading',
      agreements: [],
      disagreements: [],
      criticalBlockers: [],
      risks: [],
      missingData: [],
      riskLevel: 'LOW',
      veto: false,
      buy: { confirmationScore: 75 },
      sell: { confirmationScore: 20 },
      marketReadingScore: 75,
      marketReadingFactors: []
    };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const candles = Array.from({ length: 250 }, (_, index) => ({
      t: new Date(Date.UTC(2026, 0, 1, 0, index * 30)).toISOString(),
      o: 100 + index, h: 102 + index, l: 99 + index, c: 101 + index
    }));
    const result = await runAureviaCollaboration({
      messages: [
        { role: 'system', content: 'Analyze only supplied data. Return JSON.' },
        { role: 'user', content: JSON.stringify({ instrument: 'XAU/USD', candles }) }
      ]
    });

    assert.equal(result.data.collaboration.allFiveResponded, true);
    assert.equal(result.provider, 'AUREVIA · 5 IA');
    assert.equal(requests.length, 5);
    for (const request of requests) {
      const userMessage = request.messages.find(message => message.role === 'user');
      const payload = JSON.parse(userMessage.content);
      assert.equal(payload.candles.length, 250, request.url);
    }
    const zaiRequest = requests.find(request => request.url === zai.url);
    assert.ok(zaiRequest);
    assert.equal(zaiRequest.model, 'GLM-4.7-Flash');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});
