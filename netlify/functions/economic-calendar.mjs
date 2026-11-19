import { verifyBearerUser, assertActiveSession, json } from './_session-auth.mjs';

const cleanText = value => String(value ?? '').replace(/[<>]/g, '').slice(0, 240);

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Méthode non autorisée.' });
  let context;
  try {
    context = await verifyBearerUser(event);
    await assertActiveSession(context);
  } catch (error) {
    return json(error.statusCode || 401, { error: error.message || 'Session invalide.' });
  }

  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86400000);
  const query = new URLSearchParams({
    select: 'id,event_name,release_date,scheduled_at,source_timezone,currency,impact,source_url,source_provider,time_basis',
    is_active: 'eq.true',
    scheduled_at: 'gte.' + now.toISOString(),
    order: 'scheduled_at.asc',
    limit: '250'
  });
  query.set('scheduled_at', 'gte.' + now.toISOString());
  query.append('scheduled_at', 'lte.' + end.toISOString());

  try {
    const response = await fetch(context.base + '/rest/v1/economic_release_events?' + query.toString(), {
      headers: {
        apikey: context.service,
        authorization: 'Bearer ' + context.service,
        accept: 'application/json'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      console.error('[AUREVIA economic calendar] Supabase HTTP ' + response.status + ': ' + detail);
      return json(503, { error: 'Le calendrier économique est temporairement indisponible.', code: 'CALENDAR_STORAGE_UNAVAILABLE' });
    }
    const rows = await response.json();
    const events = (Array.isArray(rows) ? rows : []).map(row => ({
      id: row.id,
      name: cleanText(row.event_name),
      scheduledAt: row.scheduled_at,
      timezone: cleanText(row.source_timezone || 'UTC'),
      currency: cleanText(row.currency || '—'),
      impact: cleanText(row.impact || 'non précisé'),
      source: cleanText(row.source_provider || 'Source non précisée'),
      sourceUrl: /^https?:\\/\\//i.test(String(row.source_url || '')) ? row.source_url : null,
      timeBasis: cleanText(row.time_basis || 'source non précisée')
    })).filter(item => item.name && Number.isFinite(Date.parse(item.scheduledAt)));
    return json(200, { ok: true, source: 'FRED + Federal Reserve official calendar', asOf: now.toISOString(), events });
  } catch (error) {
    console.error('[AUREVIA economic calendar] request failed:', String(error.message || error).slice(0, 200));
    return json(503, { error: 'Impossible de récupérer les événements économiques.', code: 'CALENDAR_FETCH_FAILED' });
  }
}
