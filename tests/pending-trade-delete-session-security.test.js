import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261115143000_harden_pending_trade_delete_session.sql', import.meta.url), 'utf8');

test('pending trade deletion runs as invoker and requires the active AUREVIA session', () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /if not public\.aurevia_session_is_active\(\) then[\s\S]*?raise exception 'Session AUREVIA inactive ou révoquée'/i);
  assert.match(migration, /set search_path = pg_catalog, public/i);
});

test('pending trade deletion preserves owner, pending-only and no-close guards', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /where id = p_group_id and user_id = v_user/i);
  assert.match(migration, /status = 'PENDING'/i);
  assert.match(migration, /trading_position_closes/i);
  assert.match(migration, /v_group\.mode = 'unique'/i);
  assert.match(migration, /v_group\.mode = 'separate'/i);
});

test('pending trade deletion keeps journal removal atomic and restricts execute grants', () => {
  assert.match(migration, /delete from public\.trading_journal/i);
  assert.match(migration, /delete from public\.trading_positions/i);
  assert.match(migration, /delete from public\.trading_position_groups/i);
  assert.match(migration, /revoke all on function public\.aurevia_delete_pending_trade\(uuid, uuid\) from public/i);
  assert.match(migration, /revoke all on function public\.aurevia_delete_pending_trade\(uuid, uuid\) from anon/i);
  assert.match(migration, /grant execute on function public\.aurevia_delete_pending_trade\(uuid, uuid\) to authenticated, service_role/i);
});
