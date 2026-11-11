import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
test('l’interface expose les onze espaces fonctionnels',()=>{const pages=[...html.matchAll(/data-page-view="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(pages).size,11);for(const page of ['accueil','marches','risque','journal','positions','dxy','actualites','telegram','parametres','guide','admin'])assert.ok(pages.includes(page));});
test('le logo officiel, le décor cosmique et le réglage mobile sont présents',()=>{assert.match(html,/assets\/aurevia-logo-mark\.png/);assert.match(html,/id="galaxyCanvas"/);assert.match(html,/id="reduceMotion"/);assert.match(html,/auth-brand[^]*assets\/aurevia-logo-mark\.png/);assert.match(html,/id="installAppBtn"/);});
test('le badge flottant de marque n’est pas présent dans la navigation',()=>{assert.doesNotMatch(html,/sidebar-foot|floating-brand-badge/);});
test('le service worker met en cache les modules locaux requis',()=>{for(const file of ['app.js','analysis.js','confluence.js','fibonacci.js','volume-profile.js','trade-management.js','galaxy.js'])assert.ok(sw.includes(`/${file}`));});
test('les écrans ne demandent aucune clé API à l’utilisateur',()=>{assert.doesNotMatch(html,/GROQ_API_KEY|TWELVEDATA_API_KEY|TELEGRAM_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);});

test('la console admin est verrouillée par défaut et ne montre les statuts qu’après autorisation',()=>{assert.match(html,/id="adminLocked"/);assert.match(html,/id="adminUnlocked" hidden/);assert.match(html,/data-page="admin"[^>]*hidden/);});

test('la superposition cosmique ne casse pas le header sticky ni la sidebar fixe',async()=>{const css=await readFile(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/\.topbar\{[^}]*position:sticky/);assert.match(css,/\.sidebar\{[^}]*position:fixed/);assert.doesNotMatch(css,/body> :not\(\.space-scene\):not\(\.ambient\)\{position:relative/);assert.match(css,/\.mobile-nav\{display:none!important\}/);assert.doesNotMatch(html,/class="mobile-nav"/);assert.match(css,/padding-bottom:15px!important/);});
test('les onze rubriques sont des pages sœurs et non imbriquées dans Marchés',()=>{assert.match(html,/ne constitue jamais un signal d’entrée\.<\/p><\/section><\/section><\/section><section class="page-view" data-page-view="risque"/);});
test('la lisibilité de l’analyse est renforcée sur ordinateur et mobile',async()=>{const css=await readFile(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/#page-marches \.analysis-form label\{font-size:15px/);assert.match(css,/#page-marches \.structure-card p\{font-size:13px/);assert.match(css,/@media\(max-width:600px\)/);});
test('le fond cosmique utilise un rendu WebGL avec profondeur 3D',async()=>{const galaxy=await readFile(new URL('../galaxy.js',import.meta.url),'utf8');assert.match(galaxy,/getContext\('webgl'/);assert.match(galaxy,/u_time/);assert.match(galaxy,/perspective/);});

test('les cotations visibles utilisent le flux Twelve Data pour plusieurs instruments',async()=>{const quote=await readFile(new URL('../netlify/functions/market-quote.mjs',import.meta.url),'utf8');assert.match(html,/id=\"price-EURUSD\"/);assert.match(html,/id=\"price-GBPUSD\"/);assert.match(html,/id=\"price-USDJPY\"/);assert.match(html,/id=\"price-XAGUSD\"/);assert.match(quote,/api\.twelvedata\.com\/price/);});
test('l’installation PWA dispose du déclencheur navigateur et des instructions iOS',async()=>{const app=await readFile(new URL('../app.js',import.meta.url),'utf8');assert.match(html,/id=\"installAppBtn\"/);assert.match(app,/beforeinstallprompt/);assert.match(app,/Sur iPhone/);});

test('le parcours Installation est documenté dans le Guide et le manifeste PWA fournit les tailles requises',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  assert.match(html,/INSTALLATION[\s\S]*Installer AUREVIA COPILOT[\s\S]*iPhone \/ iPad[\s\S]*Android[\s\S]*Windows \/ macOS/);
  assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
  for(const file of ['aurevia-app-icon-192.png','aurevia-app-icon.png','aurevia-app-icon-maskable.png','aurevia-apple-touch-icon.png']){
    const {access}=await import('node:fs/promises'); await access(new URL(`../assets/${file}`,import.meta.url)); assert.ok(sw.includes(`/assets/${file}`));
  }
  assert.match(html,/apple-touch-icon[^>]*180x180/);
});

test('le même emblème officiel est affiché dans l’en-tête et dans les deux états du profil',()=>{
  assert.match(html,/class="brand"[^]*class="brand-logo" src="assets\/aurevia-logo-mark\.png"/);
  assert.match(html,/id="authSignedOut"[^]*class="auth-brand"[^]*assets\/aurevia-logo-mark\.png/);
  assert.match(html,/id="authSignedIn"[^]*class="auth-brand profile-brand"[^]*assets\/aurevia-logo-mark\.png/);
});
