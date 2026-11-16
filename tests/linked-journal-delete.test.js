import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../auth.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261116154532_aurevia_atomic_trade_tracking_deletion.sql', import.meta.url), 'utf8');
const start = source.indexOf('export async function deleteLinkedJournalEntryFromSupabase(');
const end = source.indexOf('\n}\n', start);
assert.notEqual(start, -1, 'linked journal delete function exists');
assert.notEqual(end, -1, 'linked journal delete function has a closing brace');
const implementation = source.slice(start, end + 2);

test('linked journal deletion uses the atomic RPC and propagates its errors', () => {
  assert.match(implementation, /supabase\.rpc\('aurevia_delete_linked_journal_entry'/);
  assert.match(implementation, /const \{data,error\}=await supabase\.rpc/);
  assert.match(implementation, /if\(error\)throw new Error\(error\.message\)/);
  assert.match(implementation, /return \{synced:true,deleted:Number\(data\.deleted\|\|0\)\}/);
});

test('linked journal deletion keeps the stale-id fallback inside the same transaction', () => {
  assert.match(migration, /if v_deleted=0 and p_group_id is not null then/);
  assert.match(migration, /delete from public\.trading_journal/);
  assert.match(migration, /JOURNAL_ENTRY_NOT_FOUND/);
  assert.match(migration, /aurevia_session_is_active\(\)/);
  assert.match(migration, /auth\.uid\(\)/);
});

test('linked journal deletion does not delete or mutate tracked positions', () => {
  assert.doesNotMatch(implementation, /trading_positions|trading_position_groups|deleteTradePosition/);
  const start = migration.indexOf('create or replace function public.aurevia_delete_linked_journal_entry');
  const end = migration.indexOf('$$;',start);
  const fn = migration.slice(start,end);
  assert.doesNotMatch(fn,/delete from public\.trading_positions|delete from public\.trading_position_groups/);
});
