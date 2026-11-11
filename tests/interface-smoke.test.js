import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
test('l’interface expose les onze espaces fonctionnels',()=>{const pages=[...html.matchAll(/data-page-view="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(pages).size,11);for(const page of ['accueil','marches','risque','journal','positions','dxy','actualites','telegram','parametres','guide','admin'])assert.ok(pages.includes(page));});
test('le logo officiel, le décor cosmique et le réglage mobile sont présents',()=>{assert.match(html,/assets\/aurevia-logo-mark\.png/);assert.match(html,/id="galaxyCanvas"/);assert.match(html,/id="reduceMotion"/);assert.match(html,/assets\/aurevia-logo-full\.png/);});
test('le badge flottant de marque n’est pas présent dans la navigation',()=>{assert.doesNotMatch(html,/sidebar-foot|floating-brand-badge/);});
test('le service worker met en cache les modules locaux requis',()=>{for(const file of ['app.js','analysis.js','confluence.js','fibonacci.js','volume-profile.js','trade-management.js','galaxy.js'])assert.ok(sw.includes(`/${file}`));});
test('les écrans ne demandent aucune clé API à l’utilisateur',()=>{assert.doesNotMatch(html,/GROQ_API_KEY|TWELVEDATA_API_KEY|TELEGRAM_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);});

test('la console admin est verrouillée par défaut et ne montre les statuts qu’après autorisation',()=>{assert.match(html,/id="adminLocked"/);assert.match(html,/id="adminUnlocked" hidden/);assert.match(html,/data-page="admin"[^>]*hidden/);});

test('la superposition cosmique ne casse pas le header sticky ni la sidebar fixe',async()=>{const css=await readFile(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/\.topbar\{[^}]*position:sticky/);assert.match(css,/\.sidebar\{[^}]*position:fixed/);assert.doesNotMatch(css,/body> :not\(\.space-scene\):not\(\.ambient\)\{position:relative/);assert.match(css,/\.mobile-nav\{display:none\}/);assert.match(css,/\.mobile-nav\{position:fixed[^}]*display:flex/);});
test('les onze rubriques sont des pages sœurs et non imbriquées dans Marchés',()=>{assert.match(html,/ne constitue jamais un signal d’entrée\.<\/p><\/section><\/section><\/section><section class="page-view" data-page-view="risque"/);});
test('la lisibilité de l’analyse est renforcée sur ordinateur et mobile',async()=>{const css=await readFile(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/#page-marches \.analysis-form label\{font-size:15px/);assert.match(css,/#page-marches \.structure-card p\{font-size:13px/);assert.match(css,/@media\(max-width:600px\)/);});
test('le fond cosmique utilise un rendu WebGL avec profondeur 3D',async()=>{const galaxy=await readFile(new URL('../galaxy.js',import.meta.url),'utf8');assert.match(galaxy,/getContext\('webgl'/);assert.match(galaxy,/u_time/);assert.match(galaxy,/perspective/);});
