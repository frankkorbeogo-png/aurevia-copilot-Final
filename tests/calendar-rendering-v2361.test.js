import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('le calendrier structuré est réellement chargé depuis son endpoint authentifié',async()=>{
 const s=await read('news.js');
 assert.match(s,/fetch\('\/api\/economic-calendar'/);
 assert.match(s,/renderCalendar\(structured,payload\)/);
 assert.match(s,/renderError\(structured/);
});
test('TradingView est visible immédiatement en complément du calendrier structuré',async()=>{
 const s=await read('news.js');
 assert.match(s,/Calendrier économique TradingView/);
 assert.match(s,/renderTradingView\(tvMount\)/);
 assert.match(s,/colorTheme:'dark'/);
 assert.doesNotMatch(s,/tvSummary/);
});
test('la source du calendrier d’affichage reste séparée du contexte macro',async()=>{
 const s=await read('news.js');
 assert.match(s,/\/api\/economic-calendar/);
 assert.doesNotMatch(s,/\/api\/macro-context/);
});
test('le cache PWA est versionné pour la mise à jour',async()=>{
 const s=await read('sw.js');assert.match(s,/aurevia-shell-v2\.3\.62/);
});
test('la route publique interne pointe vers la fonction serveur calendrier',async()=>{
 const s=await read('netlify.toml');
 assert.match(s,/from = "\/api\/economic-calendar"[\s\S]*?to = "\/.netlify\/functions\/economic-calendar"/);
});
test('les styles de la page marchés ne réimposent pas une hauteur fixe au calendrier',async()=>{
 const s=await read('style.css');
 assert.match(s,/#page-marches \.calendar-frame,#page-actualites \.calendar-frame\{height:auto/);
});
