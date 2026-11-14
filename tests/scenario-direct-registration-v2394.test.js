import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../netlify/functions/scenario-api.mjs',import.meta.url),'utf8');
const watch=readFileSync(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
const webhook=readFileSync(new URL('../netlify/functions/telegram-webhook.mjs',import.meta.url),'utf8');
test('l’enregistrement direct dans AUREVIA n’est proposé qu’après confirmation M5',()=>{
 assert.match(app,/s\.status==='entry_confirmed'/);
 assert.match(app,/status M15|confirmation M5/i);
 assert.match(api,/scenario\.status!=='entry_confirmed'/);
});
test('le mode direct utilise la même RPC transactionnelle que Telegram',()=>{
 assert.match(api,/rpc\/aurevia_create_position_from_scenario/);
 assert.match(api,/p_scenario_id:scenarioId,p_user_id:user,p_mode:mode,p_volume:volume/);
 assert.match(webhook,/rpc\/aurevia_create_position_from_scenario/);
});
test('la création vérifie l’appartenance utilisateur, l’expiration et empêche un doublon',()=>{
 assert.match(api,/user_id=eq\.\$\{user\}/);
 assert.match(api,/scenario\.trade_group_id/);
 assert.match(api,/lot_confirmation_expires_at/);
});
test('l’interface permet de saisir le lot et de choisir les deux modes de gestion',()=>{
 assert.match(app,/data-scenario-lot/);
 assert.match(app,/value="unique"/);
 assert.match(app,/value="separate"/);
});
test('le canal Telegram conserve le parcours de confirmation du lot dans le bot',()=>{
 assert.match(webhook,/start:\(\[A-F0-9\]\{8\}\):\(unique\|separate\)/);
 assert.match(watch,/inline_keyboard/);
});

test('la surveillance ne peut être créée sans une confrontation correspondant à la zone et à la direction',()=>{
 assert.match(app,/aurevia_last_confrontation/);
 assert.match(app,/confrontation\.instrument!==instrument/);
 assert.match(app,/currentAnalysis\.zoneLow/);
 assert.match(app,/Confrontez d’abord votre zone d’entrée/);
});
