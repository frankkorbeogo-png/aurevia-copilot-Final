import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261115144000_revoke_anon_table_privileges.sql', import.meta.url), 'utf8');

test('anonymous role has no direct privileges on private trading and announcement tables', () => {
  for (const table of [
    'announcement_reads',
    'announcement_recipients',
    'cme_calendar_sync',
    'trading_position_closes',
    'trading_position_groups',
    'trading_positions'
  ]) {
    assert.match(migration, new RegExp('public\\.' + table + '\\b'));
  }
  assert.match(migration, /revoke all privileges on table[\\s\\S]*from anon/i);
  assert.doesNotMatch(migration, /from authenticated/i);
  assert.doesNotMatch(migration, /from service_role/i);
});
