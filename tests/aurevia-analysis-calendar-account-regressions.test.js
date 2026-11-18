import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('le calendrier économique utilise exclusivement le widget TradingView', async () => {
  const news = await read('news.js');
  assert.match(news, /embed-widget-events\.js/);
  assert.match(news, /Calendrier économique fourni exclusivement par TradingView/);
  assert.match(news, /script\.onerror\s*=\s*unavailable/);
  assert.match(news, /setTimeout\(\(\)=>\{if\(!inner\.querySelector\('iframe'\)\)unavailable\(\);\},15000\)/);
  assert.match(news, /retry\.addEventListener\('click',load\)/);
  assert.match(news, /return\s*\(\)=>\{disposed=true/);
  assert.doesNotMatch(news, /ShowMyTrades|economic-calendar-api|alternativeCalendarProvider/i);
});

test('le cycle de vie du calendrier est attaché à la page Actualités et nettoyé à la sortie', async () => {
  const app = await read('app.js');
  assert.match(app, /let economicCalendarCleanup=null/);
  assert.match(app, /if\(economicCalendarCleanup&&page!=='actualites'\)\{economicCalendarCleanup\(\);economicCalendarCleanup=null;\}/);
  assert.match(app, /if\(page==='actualites'&&!economicCalendarCleanup\)\{economicCalendarCleanup=initEconomicCalendar\(\$\('calendarStandalone'\)\);\}/);
});

test('le DXY est épinglé sur TVC:DXY sans possibilité de changer le symbole', async () => {
  const app = await read('app.js');
  assert.match(app, /Graphique Dollar Index DXY — TradingView/);
  assert.match(app, /symbol=TVC%3ADXY/);
  assert.match(app, /symboledit=0/);
  assert.doesNotMatch(app, /symbol=AAPL/);
});

test('le détail de l’analyse IA est transmis au panneau et distingue les contrôles des IA', async () => {
  const app = await read('app.js');
  const analysis = await read('analysis.js');
  const endpoint = await read('netlify/functions/ai-analysis.mjs');
  assert.match(analysis, /marketReading:aiResult\?\.marketReading\|\|''/);
  assert.match(analysis, /decisionDetails:decision/);
  assert.match(app, /LECTURE DÉTAILLÉE DU MARCHÉ/);
  assert.match(app, /CONTRÔLE DES IA/);
  assert.match(app, /POINTS CONFIRMÉS/);
  assert.match(app, /DIVERGENCES/);
  assert.match(app, /BLOCAGES CRITIQUES/);
  assert.match(app, /DONNÉES MANQUANTES/);
  assert.match(endpoint, /marketReading:String\(out\.marketReading\|\|''\)\.slice\(0,10000\)/);
});

test('la suppression définitive est liée avant la restauration asynchrone de session et vérifiée côté serveur', async () => {
  const auth = await read('auth.js');
  const endpoint = await read('netlify/functions/account-delete.mjs');
  const init = auth.slice(auth.indexOf('export async function initAuth()'));
  const handlerAt = init.indexOf("deleteAccountButton.addEventListener('click'");
  const googleAt = init.indexOf('const startGoogleAuth=');
  assert.ok(handlerAt >= 0 && googleAt > handlerAt, 'le gestionnaire doit être attaché tôt dans initAuth');
  assert.match(init, /deleteAccountBound!=='1'/);
  assert.match(init, /sessionReady/);
  assert.match(init, /fetch\('\/api\/account-delete'/);
  assert.match(init, /confirmation:'SUPPRIMER'/);
  assert.match(endpoint, /body\.confirmation!=='SUPPRIMER'/);
  assert.match(endpoint, /aurevia_account_delete_guarded/);
  assert.match(endpoint, /LAST_ADMIN_PROTECTED/);
  assert.match(endpoint, /deleted:true/);
});


test('M30 est l’unité principale et transmet exactement 250 bougies clôturées au moteur IA', async () => {
  const analysis = await read('analysis.js');
  const endpoint = await read('netlify/functions/ai-analysis.mjs');
  const collaboration = await read('netlify/functions/ai-collaboration.mjs');
  assert.match(analysis, /frames\.M30=await fetchFrame\(pair,FRAMES\.M30,251\)/);
  assert.match(analysis, /primary\.candles\.slice\(-250\)/);
  assert.match(analysis, /primary:\{candles:primary\.candles/);
  assert.match(endpoint, /primary\.candles\.length!==250/);
  assert.match(endpoint, /decisionTimeframe:'M30'/);
  assert.match(endpoint, /candleCountM30:candles\.length/);
  assert.match(endpoint, /250 bougies clôturées/);
  assert.match(collaboration, /inputCandleCountM30:info\.candleCountM30/);
  assert.match(collaboration, /candleCountM30:Array\.isArray\(market\.candles\)/);
});

test('M15 reste un affinage facultatif et M5 conserve la confirmation d’entrée', async () => {
  const endpoint = await read('netlify/functions/ai-analysis.mjs');
  const collaboration = await read('netlify/functions/ai-collaboration.mjs');
  const index = await read('index.html');
  assert.match(endpoint, /M15 \(affinement des zones et du timing\)/);
  assert.match(collaboration, /scénario M30/);
  assert.match(index, /M30 · Analyse/);
  assert.match(index, /M15 · Affinage/);
  assert.match(index, /validation automatique par l’IA sur M5/);
});
