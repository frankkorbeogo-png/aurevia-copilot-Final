import crypto from 'node:crypto';

const SOURCE_URL = 'https://www.cmegroup.com/trading-hours.html';
const SOURCE_KEY = 'cme-globex-holiday-calendar';
const MAX_EXCERPT = 60000;
const REQUEST_TIMEOUT_MS = 8000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryDelay(response) {
  const raw = String(response?.headers?.get('retry-after') || '').trim();
  const seconds = Number(raw);
  const date = Date.parse(raw);
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 2000;
  return Math.max(1500, requested);
}

async function fetchCmeSource() {
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(SOURCE_URL, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Mozilla/5.0 (compatible; AUREVIA-COPILOT-calendar-sync/2.0)'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      if (attempt === 0) {
        console.warn('[AUREVIA CME sync] transient source network error; retrying once', String(error.message || error).slice(0, 180));
        await wait(1500);
        continue;
      }
      throw error;
    }
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      const delay = response.status === 429 ? retryDelay(response) : 1500;
      if (delay > 6000) return response;
      await response.text().catch(() => '');
      console.warn('[AUREVIA CME sync] upstream HTTP ' + response.status + '; retrying after ' + delay + 'ms');
      await wait(delay);
      continue;
    }
    return response;
  }
  return response;
}

function cleanText(value = '') {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&rsquo;|&#8217;|&#39;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// The annual CME summary table is deliberately captured as unverified candidates.
// It does not identify a specific CFD/OTC product and must never close one.
function findScheduleSection(html) {
  const matches = [...html.matchAll(/(20\d{2}) CME Globex Trading Schedule/gi)];
  if (!matches.length) return { index: -1, year: null };
  const currentYear = new Date().getUTCFullYear();
  const selected = matches.find(match => Number(match[1]) === currentYear)
    || matches.find(match => Number(match[1]) > currentYear)
    || matches[matches.length - 1];
  return { index: selected.index, year: Number(selected[1]) };
}

function extractHolidayCandidates(html, calendarYear) {
  const sectionStart = findScheduleSection(html).index;
  if (sectionStart < 0) return [];
  const section = html.slice(sectionStart, sectionStart + 50000);
  const tableMatch = section.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];

  const rows = [...tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  return rows.slice(1).map(match => {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(cell => cleanText(cell[1]));
    if (cells.length < 2 || !cells[0] || !cells[1]) return null;
    return {
      calendar_year: calendarYear,
      holiday: cells[0],
      date_range: cells[1],
      venue: 'CME_GLOBEX',
      product_code: null,
      session: null,
      closure_type: 'holiday_schedule_to_review',
      timezone: 'America/Chicago',
      source_url: SOURCE_URL,
      verification_status: 'unverified_product_scope',
      automatic_closure_allowed: false
    };
  }).filter(Boolean);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body)
  };
}

export async function handler() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !service) {
    console.error('[AUREVIA CME sync] stage=config error=missing_supabase_configuration');
    return json(503, { ok: false, stage: 'config', code: 'SUPABASE_CONFIG_MISSING' });
  }

  let stage = 'cme_fetch';
  try {
    const response = await fetchCmeSource();
    if (!response.ok) {
      const error = new Error(`CME source returned HTTP ${response.status}`);
      error.code = 'CME_HTTP_ERROR';
      error.upstreamStatus = response.status;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }

    const html = await response.text();
    if (!html || html.length < 1000) {
      const error = new Error('CME source response is empty or unexpectedly short');
      error.code = 'CME_EMPTY_RESPONSE';
      throw error;
    }
    if (!/CME Group Holiday and Trading Hours|CME Globex Trading Schedule/i.test(html)) {
      const error = new Error('Expected CME calendar markers were not found; existing stored snapshot is preserved');
      error.code = 'CME_SOURCE_MARKER_MISSING';
      error.retryable = false;
      throw error;
    }

    stage = 'parse';
    const contentHash = crypto.createHash('sha256').update(html).digest('hex');
    const schedule = findScheduleSection(html);
    const excerptStart = schedule.index >= 0 ? schedule.index : 0;
    const excerpt = html.slice(excerptStart, excerptStart + MAX_EXCERPT);
    const holidayCandidates = extractHolidayCandidates(html, schedule.year);

    const payload = {
      source_key: SOURCE_KEY,
      source_url: SOURCE_URL,
      fetched_at: new Date().toISOString(),
      content_hash: contentHash,
      source_excerpt: excerpt,
      holiday_candidates: holidayCandidates,
      parse_status: holidayCandidates.length ? 'review_required' : 'source_captured_no_candidates',
      note: holidayCandidates.length
        ? 'Candidats issus du calendrier CME Globex annuel. Portée produit non vérifiée : ces éléments sont informatifs uniquement et ne peuvent déclencher aucune fermeture Forex ou XAU/USD.'
        : 'Source CME capturée mais aucun candidat structuré détecté. Vérification humaine requise; aucune fermeture automatique autorisée.'
    };

    stage = 'supabase_upsert';
    const saved = await fetch(`${base}/rest/v1/cme_calendar_sync?on_conflict=source_key`, {
      method: 'POST',
      headers: {
        apikey: service,
        authorization: `Bearer ${service}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    if (!saved.ok) {
      const detail = (await saved.text()).slice(0, 300);
      const error = new Error(`Supabase upsert failed HTTP ${saved.status}: ${detail}`);
      error.code = 'SUPABASE_UPSERT_ERROR';
      error.upstreamStatus = saved.status;
      error.retryable = saved.status === 429 || saved.status >= 500;
      throw error;
    }

    console.info('[AUREVIA CME sync]', JSON.stringify({
      ok: true,
      stage: 'complete',
      excerptLength: excerpt.length,
      candidateCount: holidayCandidates.length,
      calendarYear: schedule.year,
      parseStatus: payload.parse_status,
      contentHash
    }));
    return json(200, {
      ok: true,
      source: SOURCE_URL,
      fetchedAt: payload.fetched_at,
      excerptLength: excerpt.length,
      contentHash,
      candidateCount: holidayCandidates.length,
      calendarYear: schedule.year,
      parseStatus: payload.parse_status,
      automaticMarketClosuresApplied: false
    });
  } catch (error) {
    console.error('[AUREVIA CME sync]', JSON.stringify({
      ok: false,
      stage,
      code: error.code || 'UNEXPECTED_SYNC_ERROR',
      message: String(error.message || error).slice(0, 500)
    }));
    const retryable = error.retryable !== false;
    const statusCode = retryable ? 503 : 422;
    return json(statusCode, {
      ok: false,
      stage,
      code: error.code || 'UNEXPECTED_SYNC_ERROR',
      upstreamStatus: error.upstreamStatus || null,
      retryable,
      error: String(error.message || error).slice(0, 500),
      automaticMarketClosuresApplied: false
    });
  }
}
