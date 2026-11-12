import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const endpoint = new URL('../netlify/functions/account-delete.mjs', import.meta.url);

test('la suppression personnelle vérifie le jeton Supabase sans dépendre du heartbeat', async () => {
  const source = await readFile(endpoint, 'utf8');
  assert.ok(source.includes('verifyBearerUser(event)'));
  assert.ok(!source.includes('assertActiveSession'));
  assert.ok(source.includes('context.user.id'));
  assert.ok(source.includes('/auth/v1/admin/users/'));
});

test('la suppression exige la confirmation explicite SUPPRIMER', async () => {
  const source = await readFile(endpoint, 'utf8');
  assert.ok(source.includes("body.confirmation!=='SUPPRIMER'"));
});
