import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../auth.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261115205000_atomic_manual_trade_group_sync.sql', import.meta.url), 'utf8');
const tradeManagement = await readFile(new URL('../trade-management.js', import.meta.url), 'utf8');

test('la synchronisation manuelle appelle une seule RPC transactionnelle', () => {
  const start = auth.indexOf('export async function syncTradeGroupToSupabase(group)');
  const end = auth.indexOf('export async function deleteLinkedJournalEntryFromSupabase', start);
  const fn = auth.slice(start, end);
  assert.ok(fn.includes("supabase.rpc('aurevia_sync_trade_group'"));
  assert.ok(fn.includes('p_group:groupRow,p_positions:positions,p_journal:journalRows'));
  assert.equal(fn.includes(".from('trading_position_groups').upsert"), false);
  assert.equal(fn.includes(".from('trading_positions').upsert"), false);
  assert.equal(fn.includes(".from('trading_journal').insert"), false);
});

test('la RPC déduit l’utilisateur du JWT et exige une session AUREVIA active', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.ok(migration.includes('public.aurevia_session_is_active()'));
  assert.ok(migration.includes('AUREVIA_SESSION_REQUIRED'));
  assert.ok(migration.includes('TRADE_GROUP_NOT_OWNED'));
  assert.ok(migration.includes('TRADE_POSITION_NOT_OWNED'));
  assert.ok(migration.includes('security invoker'));
  assert.ok(migration.includes('grant execute on function public.aurevia_sync_trade_group(jsonb,jsonb,jsonb) to authenticated'));
  assert.ok(migration.includes('from public, anon'));
});

test('la RPC protège les créations concurrentes et refuse les positions dupliquées', () => {
  assert.ok(migration.includes('pg_advisory_xact_lock(hashtextextended(v_group_id::text, 0))'));
  assert.ok(migration.includes('DUPLICATE_TRADE_POSITION'));
  assert.ok(migration.includes('INVALID_TRADE_POSITION'));
});

test('la synchronisation des paramètres ne remplace jamais les clôtures, volumes restants ni P/L existants', () => {
  const positionUpsert = migration.slice(migration.indexOf('on conflict(id) do update set'), migration.indexOf('if coalesce(v_position_count,0)=0'));
  assert.ok(positionUpsert.includes('entry_price=excluded.entry_price'));
  assert.ok(positionUpsert.includes('stop_loss=excluded.stop_loss'));
  assert.ok(positionUpsert.includes('take_profit=excluded.take_profit'));
  for (const field of ['status=excluded.status','volume_remaining=excluded.volume_remaining','net_pnl=excluded.net_pnl','gross_pnl=excluded.gross_pnl','fees=excluded.fees','trigger_seen=excluded.trigger_seen','activated_at=excluded.activated_at']) {
    assert.equal(positionUpsert.includes(field), false, `champ métier protégé de l’écrasement: ${field}`);
  }
});

test('le mode unique conserve un seul journal parent et rattache tous les enfants', () => {
  assert.ok(migration.includes('INVALID_UNIQUE_JOURNAL_MAPPING'));
  assert.ok(migration.includes('where group_id=v_group_id and user_id=v_user_id'));
  assert.ok(migration.includes("jsonb_build_object('id',v_journal_id,'positionId',null)"));
  assert.ok(tradeManagement.includes("if(group.mode==='unique')"));
});

test('le mode trades séparés conserve une fiche distincte par enfant', () => {
  assert.ok(migration.includes('INVALID_SEPARATE_JOURNAL_MAPPING'));
  assert.ok(migration.includes('on conflict(user_id,position_id)'));
  assert.ok(migration.includes("jsonb_build_object('id',v_journal_id,'positionId',v_position_id)"));
  assert.ok(tradeManagement.includes("journalRows=group.children.map(child=>"));
});

test('la RPC ne supprime pas les anciennes fiches ni les positions non présentes dans un payload', () => {
  assert.equal(/delete\s+from\s+public\.trading_(position_groups|positions|journal)/i.test(migration), false);
});


const closeMigration = await readFile(new URL('../supabase/migrations/20261115210000_atomic_close_fx_snapshot.sql', import.meta.url), 'utf8');

test('la clôture manuelle et son snapshot FX sont enregistrés dans une seule RPC', () => {
  const start = auth.indexOf('export async function syncTradeCloseToSupabase(group,child,closeEvent)');
  const end = auth.indexOf('export async function sendTelegramTest', start);
  const fn = auth.slice(start, end);
  assert.ok(fn.includes("supabase.rpc('aurevia_record_position_close'"));
  assert.ok(fn.includes('p_fx_snapshot:closeEvent.fxSnapshot??null'));
  assert.equal(fn.includes(".from('trading_position_closes').update"), false);
  assert.ok(closeMigration.includes('fx_snapshot'));
  assert.ok(closeMigration.includes('p_fx_snapshot'));
  assert.ok(closeMigration.includes('Résultat net incohérent'));
  assert.ok(closeMigration.includes('aurevia_session_is_active()'));
});

test('l’ancienne signature de clôture ne reste pas accessible sans snapshot FX', () => {
  assert.ok(closeMigration.includes('drop function if exists public.aurevia_record_position_close('));
  assert.ok(closeMigration.includes('revoke all on function public.aurevia_record_position_close('));
  assert.ok(closeMigration.includes('to authenticated'));
  assert.ok(closeMigration.includes('from public,anon'));
});
