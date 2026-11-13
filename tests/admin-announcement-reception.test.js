import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const adminApi = await readFile(new URL('../netlify/functions/admin-api.mjs', import.meta.url), 'utf8');

test('le compte administrateur conserve l’accès au centre et au compteur des annonces', () => {
  assert.match(app, /async function loadAnnouncements\(\)\{if\(!window\.__aureviaAuthenticated\)return;/);
  assert.doesNotMatch(app, /__aureviaAdminVerified===true\)return;[^\n]*loadAnnouncements/);
  assert.match(app, /if\(announcementsLink\)announcementsLink\.hidden=false/);
  assert.match(app, /if\(announcementsView\)announcementsView\.hidden=false/);
  assert.doesNotMatch(app, /if\(page==='annonces'&&window\.__aureviaAdminVerified===true\)page='accueil'/);
});

test('les administrateurs ayant activé les notifications Telegram ne sont pas exclus des annonces', () => {
  assert.match(adminApi, /eligible\.push\(chatId\)/);
  assert.doesNotMatch(adminApi, /Never send product announcements to administrator accounts/);
  assert.doesNotMatch(adminApi, /checkedAdmins\.set\(userId,await rpc\(base,key,'aurevia_is_admin'/);
});
