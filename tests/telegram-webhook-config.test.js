import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../netlify/functions/admin-api.mjs',import.meta.url),'utf8');

test('la configuration du webhook Telegram reçoit les messages et les clics sur boutons inline',()=>{
  assert.match(source,/allowed_updates:\['message','callback_query'\]/);
});

test('le contrôle du webhook vérifie réellement que callback_query est activé',()=>{
  assert.match(source,/info\.allowed_updates/);
  assert.match(source,/allowedUpdates\.includes\('callback_query'\)/);
  assert.match(source,/callback_queries_enabled:callbackQueriesEnabled/);
  assert.match(source,/info\.url===webhookUrl&&callbackQueriesEnabled/);
});
