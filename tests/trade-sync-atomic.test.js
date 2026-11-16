import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../auth.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261116144803_aurevia_atomic_manual_trade_group_sync.sql', import.meta.url), 'utf8');
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


const closeMigration = await readFile(new URL('../supabase/migrations/20261116144811_aurevia_atomic_close_fx_snapshot.sql', import.meta.url), 'utf8');

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


const worker = await readFile(new URL('../netlify/functions/trade-watch.mjs', import.meta.url), 'utf8');
const workerCloseMigration = await readFile(new URL('../supabase/migrations/20261116144819_aurevia_atomic_worker_close_fx_snapshot.sql', import.meta.url), 'utf8');

test('le worker transmet le snapshot FX à la RPC de clôture, sans seconde écriture REST', () => {
  assert.ok(worker.includes('p_fx_snapshot:fxSnapshot'));
  assert.equal(worker.includes("trading_position_closes?id=eq."), false);
  assert.ok(workerCloseMigration.includes('fx_snapshot'));
  assert.ok(workerCloseMigration.includes("auth.role(),'')<>'service_role'"));
  assert.ok(workerCloseMigration.includes('Résultat net incohérent'));
  assert.ok(workerCloseMigration.includes('to service_role'));
  assert.ok(workerCloseMigration.includes('from public,anon,authenticated'));
});


const deletionMigration = await readFile(new URL('../supabase/migrations/20261116144826_aurevia_atomic_trade_tracking_deletion.sql', import.meta.url), 'utf8');

test('le retrait d’un trade clôturé et le retrait de son groupe sont atomiques', () => {
  assert.ok(auth.includes("supabase.rpc('aurevia_delete_closed_trade_position'"));
  assert.ok(auth.includes("supabase.rpc('aurevia_delete_open_trade_group'"));
  assert.ok(auth.includes("supabase.rpc('aurevia_delete_closed_trade_group'"));
  assert.ok(deletionMigration.includes('TRADE_NOT_FULLY_CLOSED'));
  assert.ok(deletionMigration.includes('TRADE_CLOSE_RECORD_REQUIRED'));
  assert.ok(deletionMigration.includes('OPEN_UNIQUE_GROUP_REQUIRED'));
  assert.ok(deletionMigration.includes('TRADE_GROUP_HAS_CLOSES'));
  assert.ok(deletionMigration.includes('TRADE_GROUP_NOT_FULLY_CLOSED'));
});

test('les suppressions du suivi exigent le propriétaire et une session active', () => {
  const functions = ['aurevia_delete_closed_trade_position','aurevia_delete_open_trade_group','aurevia_delete_closed_trade_group','aurevia_delete_linked_journal_entry'];
  for (const name of functions) {
    const start = deletionMigration.indexOf(`create or replace function public.${name}`);
    assert.ok(start >= 0, `fonction manquante: ${name}`);
    const end = deletionMigration.indexOf('$$;',start);
    const fn = deletionMigration.slice(start,end);
    assert.ok(fn.includes('auth.uid()'), `auth.uid manquant: ${name}`);
    assert.ok(fn.includes('aurevia_session_is_active()'), `session active manquante: ${name}`);
    assert.ok(fn.includes('security invoker'), `security invoker manquant: ${name}`);
  }
});

test('les fiches journal sont conservées lors du retrait du suivi, avec clés étrangères détachées', () => {
  assert.ok(deletionMigration.includes("'journal_preserved',true"));
  assert.ok(deletionMigration.includes('delete from public.trading_position_groups'));
  assert.ok(deletionMigration.includes('delete from public.trading_positions'));
  assert.ok(deletionMigration.includes('grant execute on function public.aurevia_delete_linked_journal_entry(uuid,uuid,uuid) to authenticated'));
});
