import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');

test('le calendrier demande toutes les devises sans envoyer currency=all',async()=>{
  const s=await read('netlify/functions/economic-calendar.mjs');
  assert.match(s,/api\/public\/calendar\/v1/);
  assert.doesNotMatch(s,/searchParams\.set\(['"]currency['"],['"]all['"]\)/);
  assert.match(s,/searchParams\.set\(['"]impact['"],['"]high,medium,low['"]\)/);
  assert.match(s,/searchParams\.set\(['"]days['"],['"]14['"]\)/);
});

test('le démarrage authentifié dispose d’un repli si l’événement initial est manqué',async()=>{
  const s=await read('app.js');
  assert.match(s,/initAuth\(\)\.then\(\(\)=>\{if\(window\.__aureviaAuthenticated\)bootAuthenticatedApp\(\);\}\)/);
  assert.match(s,/initEconomicCalendar\(\$\('calendarWidget'\),getAnalysisAccessToken\)/);
});
