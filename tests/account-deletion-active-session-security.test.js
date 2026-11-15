import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cases = [
  ['account-delete.mjs', /await assertActiveSession\(context\)/],
  ['account-reject-new-login.mjs', /await assertActiveSession\(context\)/],
];

for (const [file, guard] of cases) {
  test(`${file} requires an active AUREVIA session before deleting an Auth user`, async () => {
    const source = await readFile(new URL(`../netlify/functions/${file}`, import.meta.url), 'utf8');
    assert.match(source, /import\s*\{[^}]*assertActiveSession[^}]*\}\s*from\s*['"]\.\/\_session-auth\.mjs['"]/);
    const authCheck = source.indexOf('await verifyBearerUser(event)');
    const sessionCheck = source.indexOf('await assertActiveSession(context)');
    const deletion = source.indexOf('/auth/v1/admin/users/');
    assert.ok(authCheck >= 0, 'must authenticate the bearer token');
    assert.ok(sessionCheck > authCheck, 'must validate the active AUREVIA session after authentication');
    assert.ok(deletion > sessionCheck, 'must validate the active session before deleting the Auth user');
    assert.match(source, guard);
  });
}
