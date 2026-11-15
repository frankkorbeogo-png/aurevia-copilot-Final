import crypto from 'node:crypto';

const SOURCE_URL = 'https://www.cmegroup.com/trading-hours.html';
const SOURCE_KEY = 'cme-globex-holiday-calendar';
const MAX_EXCERPT = 60000;

export async function handler(event) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !service) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'Configuration Supabase absente.' }) };
  }

  try {
    const response = await fetch(SOURCE_URL, {
      headers: { accept: 'text/html', 'user-agent': 'AUREVIA-COPILOT-calendar-sync/1.0' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('CME répond HTTP ' + response.status);

    const html = await response.text();
    if (!html.includes('CME Globex Trading Schedule')) {
      throw new Error('La page CME ne contient pas le calendrier attendu; aucune donnée remplacée.');
    }

    const contentHash = crypto.createHash('sha256').update(html).digest('hex');
    const start = html.indexOf('CME Globex Trading Schedule');
    const excerpt = html.slice(Math.max(0, start), Math.max(0, start) + MAX_EXCERPT);
    const payload = {
      source_key: SOURCE_KEY,
      source_url: SOURCE_URL,
      fetched_at: new Date().toISOString(),
      content_hash: contentHash,
      source_excerpt: excerpt,
      holiday_candidates: [],
      parse_status: 'review_required',
      note: 'Copie automatique de la page CME récupérée. Le contenu doit être vérifié par produit; aucune fermeture AUREVIA n’est appliquée automatiquement.'
    };

    const saved = await fetch(base + '/rest/v1/cme_calendar_sync?on_conflict=source_key', {
      method: 'POST',
      headers: {
        apikey: service,
        authorization: 'Bearer ' + service,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    if (!saved.ok) {
      throw new Error('Enregistrement Supabase impossible: HTTP ' + saved.status + ' ' + (await saved.text()).slice(0, 300));
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        source: SOURCE_URL,
        fetchedAt: payload.fetched_at,
        excerptLength: excerpt.length,
        contentHash,
        automaticMarketClosuresApplied: false,
        status: 'review_required'
      })
    };
  } catch (error) {
    console.error('[AUREVIA CME calendar sync]', error.message);
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error.message, automaticMarketClosuresApplied: false })
    };
  }
}
