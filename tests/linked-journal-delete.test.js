import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../auth.js', import.meta.url), 'utf8');
const start = source.indexOf('export async function deleteLinkedJournalEntryFromSupabase(');
const end = source.indexOf('\n}\n', start);
assert.notEqual(start, -1, 'linked journal delete function exists');
assert.notEqual(end, -1, 'linked journal delete function has a closing brace');
const implementation = source.slice(start, end + 2);

test('linked journal deletion checks the actual auth error variable', () => {
  assert.match(implementation, /error:userError/);
  assert.match(implementation, /if\s*\(userError\)\s*throw new Error\(userError\.message\)/);
  assert.doesNotMatch(implementation, /if\s*\(error\)/);
});

test('linked journal deletion confirms that at least one journal row was deleted', () => {
  assert.match(implementation, /const deleted=\(removed\.data\|\|\[\]\)\.length/);
  assert.match(implementation, /if\(!deleted\)throw new Error/);
  assert.match(implementation, /return \{synced:true,deleted\}/);
});

test('linked journal deletion does not delete or mutate tracked positions', () => {
  assert.doesNotMatch(implementation, /trading_positions|trading_position_groups|deleteTradePosition/);
});
