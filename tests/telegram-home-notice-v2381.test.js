import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = name => readFile(new URL('../'+name, import.meta.url), 'utf8');
test('l’accueil invite à connecter Telegram avec un accès direct à la liaison', async()=>{
 const html=await read('index.html');
 assert.match(html,/id="telegramHomeNotice"[\s\S]*?Connectez AUREVIA à Telegram[\s\S]*?data-goto="telegram"/);
});
test('la notification disparaît après vérification d’une liaison Telegram active', async()=>{
 const app=await read('app.js');
 assert.match(app,/async function refreshTelegramHomeNotice\([\s\S]*?loadTelegramPreferences\(\)[\s\S]*?notice\.hidden=Boolean\(prefs\?\.chat_id\)/);
 assert.match(app,/refreshTelegramHomeNotice\(\)/);
});
test('le cache PWA change de version avec la nouvelle notification', async()=>{
 const sw=await read('sw.js');assert.match(sw,/aurevia-shell-v2\.3\.82/);
});
