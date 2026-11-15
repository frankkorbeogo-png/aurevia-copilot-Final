import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cases = [
  ['account-delete.mjs', 'aurevia_account_delete_guarded'],
  ['account-reject-new-login.mjs', '/auth/v1/admin/users/'],
];

for (const [file, deletionMarker] of cases) {
  test(`${file} requires an active AUREVIA session before deleting an Auth user`, async () => {
    const source = await readFile(new URL(`../netlify/functions/${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes('assertActiveSession'));
    assert.ok(source.includes("from './_session-auth.mjs'"));
    const authCheck = source.indexOf('await verifyBearerUser(event)');
    const sessionCheck = source.indexOf('await assertActiveSession(context)');
    const deletion = source.indexOf(deletionMarker);
    assert.ok(authCheck >= 0, 'must authenticate the bearer token');
    assert.ok(sessionCheck > authCheck, 'must validate the active AUREVIA session after authentication');
    assert.ok(deletion > sessionCheck, 'must validate the active session before account deletion');
  });
}
