import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261116154522_aurevia_atomic_manual_trade_group_sync.sql', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../auth.js', import.meta.url), 'utf8');

test('la synchronisation manuelle passe par une seule RPC transactionnelle', () => {
  assert.match(auth, /supabase\.rpc\('aurevia_sync_trade_group'/);
  const start = auth.indexOf('export async function syncTradeGroupToSupabase');
  const end = auth.indexOf('\n}', start);
  const body = auth.slice(start, end);
  assert.doesNotMatch(body, /\.from\(['"]trading_(position_groups|positions|journal)['"]\)\.(upsert|insert|update)/);
  assert.match(body, /journalMappings:Array\.isArray\(data\.journal_mappings\)/);
});

test('le RPC est authentifié, protégé par session et atomique côté PostgreSQL', () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /aurevia_session_is_active\(\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /grant execute .* to authenticated/i);
  assert.match(migration, /revoke all .* from public, anon/i);
});

test('la synchronisation ne remplace pas les états et résultats de suivi déjà enregistrés', () => {
  const positionConflict = migration.slice(migration.indexOf('on conflict(id) do update set', migration.indexOf('insert into public.trading_positions')), migration.indexOf('returning 1 into v_position_count'));
  assert.doesNotMatch(positionConflict, /status\s*=|volume_remaining\s*=|gross_pnl\s*=|net_pnl\s*=|trigger_seen\s*=|activated_at\s*=/i);
  const journalConflict = migration.slice(migration.indexOf('on conflict(user_id,group_id)'), migration.indexOf('update public.trading_positions set journal_id'));
  assert.doesNotMatch(journalConflict, /result\s*=|pnl\s*=|gross_pnl\s*=|fees\s*=/i);
});

test('le mode trades séparés exige une correspondance journal unique pour chaque position', () => {
  assert.match(migration, /v_journal_position_ids uuid\[\]/);
  assert.match(migration, /v_position_id=any\(v_journal_position_ids\)/);
  assert.match(migration, /INCOMPLETE_SEPARATE_JOURNAL_MAPPING/);
});

test('le mode position unique conserve une fiche parent et lie toutes les positions', () => {
  assert.match(migration, /INVALID_UNIQUE_JOURNAL_MAPPING/);
  assert.match(migration, /where group_id=v_group_id and user_id=v_user_id/);
  assert.match(migration, /jsonb_build_object\('id',v_journal_id,'positionId',null\)/);
});
