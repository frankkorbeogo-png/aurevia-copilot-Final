import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const schema = await readFile(new URL('../supabase/migrations/20261116100000_aurevia_license_and_trial_core.sql', import.meta.url), 'utf8');
const activation = await readFile(new URL('../supabase/migrations/20261116100600_aurevia_license_activation_requires_verified_email.sql', import.meta.url), 'utf8');

test('a license row is locked while its one-time activation is decided', () => {
  assert.match(activation, /where key_hash\s*=\s*p_key_hash for update/i);
});

test('an already activated key is accepted again only for its original user', () => {
  assert.match(activation, /v_license\.status\s*=\s*'active'\s+and\s+v_license\.assigned_user_id\s*=\s*p_user_id/i);
  assert.match(activation, /if v_license\.status\s*<>\s*'issued' then/i);
  assert.match(activation, /'LICENSE_UNAVAILABLE'/i);
});

test('deleting the original Auth user cannot make an activated key available again', () => {
  assert.match(schema, /assigned_user_id uuid unique references auth\.users\(id\) on delete set null/i);
  assert.match(activation, /if v_license\.status\s*<>\s*'issued' then/i);
  assert.doesNotMatch(activation, /set status\s*=\s*'issued'/i);
});

test('one account cannot be assigned multiple license rows at once', () => {
  assert.match(schema, /assigned_user_id uuid unique references auth\.users\(id\)/i);
});
