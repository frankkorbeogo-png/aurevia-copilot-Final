import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../netlify/functions/${file}`, import.meta.url), 'utf8');

test('account-delete.mjs requires an authenticated active session before deleting an Auth user', async () => {
 const source=await read('account-delete.mjs');
 assert.ok(source.includes('verifyBearerUser(event)'));
 assert.ok(source.includes('assertSessionIsActive(context)'));
 assert.ok(!source.includes('assertActiveSession'));
 const authCheck=source.indexOf('verifyBearerUser(event)');
 const sessionCheck=source.indexOf('assertSessionIsActive(context)');
 const deletion=source.indexOf('aurevia_account_delete_guarded');
 assert.ok(authCheck>=0&&sessionCheck>authCheck&&deletion>sessionCheck);
});

test('account-reject-new-login only deletes the just-created identity after verifying its owner and creation window', async () => {
 const source=await read('account-reject-new-login.mjs');
 assert.ok(source.includes('verifyBearerUser(event)'));
 assert.ok(!source.includes('assertSessionIsActive'));
 assert.ok(!source.includes('assertActiveSession'));
 assert.ok(source.includes('context.user.created_at'));
 assert.ok(source.includes('startedAt-30000'));
 assert.ok(source.includes('age>15*60*1000'));
 assert.ok(source.indexOf('verifyBearerUser(event)')<source.indexOf('/auth/v1/admin/users/'));
});
