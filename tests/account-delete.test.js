import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const endpoint = await read('../netlify/functions/account-delete.mjs');
const admin = await read('../netlify/functions/admin-api.mjs');
const cleanup = await read('../netlify/functions/_account-deletion.mjs');
const auth = await read('../auth.js');
const sharedRevocationMigration = await read('../supabase/migrations/20261113100000_shared_account_deletion_session_revocation.sql');
const guardedDeletionMigration = await read('../supabase/migrations/20261116070000_guard_last_admin_account_deletion.sql');

test('la suppression personnelle vérifie le jeton Supabase et la session AUREVIA active', () => {
  assert.ok(endpoint.includes('verifyBearerUser(event)'));
  assert.ok(endpoint.includes('assertActiveSession(context)'));
  assert.ok(endpoint.indexOf('assertActiveSession(context)') < endpoint.indexOf('aurevia_account_delete_guarded'));
  assert.ok(endpoint.includes('context.user.id'));
});

test('la suppression exige la confirmation explicite SUPPRIMER', () => {
  assert.ok(endpoint.includes("body.confirmation!=='SUPPRIMER'"));
});

test('la suppression personnelle utilise une RPC atomique et protège le dernier administrateur', () => {
  assert.ok(endpoint.includes('aurevia_account_delete_guarded'));
  assert.ok(endpoint.includes('LAST_ADMIN_PROTECTED'));
  assert.ok(endpoint.includes('return json(409'));
  assert.ok(endpoint.includes('application_data_deleted:true'));
  assert.doesNotMatch(endpoint, /deleteUserApplicationData/);
  assert.equal(endpoint.includes('/auth/v1/admin/users/'), false);
  assert.ok(guardedDeletionMigration.includes('pg_advisory_xact_lock'));
  assert.ok(guardedDeletionMigration.includes('LAST_ADMIN_PROTECTED'));
  assert.ok(guardedDeletionMigration.includes('delete from auth.users where id = p_user_id'));
});

test('la suppression administrative continue à purger les données et révoquer la session', () => {
  assert.ok(admin.includes('deleteUserApplicationData'));
  const start = admin.indexOf("if(action==='delete_user')");
  const end = admin.indexOf("if(action==='announcement_create')", start);
  const block = admin.slice(start, end);
  assert.ok(block.includes('aurevia_admin_revoke_session'));
  assert.ok(block.includes('application_data_deleted:true'));
  assert.ok(block.indexOf('deleteUserApplicationData') < block.indexOf('/auth/v1/admin/users/'));
});

test('le nettoyage partagé couvre les données métier, préférences, annonces et Telegram', () => {
  for (const table of [
    'announcement_reads', 'announcement_recipients', 'aurevia_analysis_scenarios',
    'aurevia_trade_alert_events', 'telegram_connections', 'user_preferences',
    'trading_position_closes', 'trading_positions', 'trading_position_groups',
    'trading_journal', 'profiles'
  ]) assert.ok(cleanup.includes(`'${table}'`), `table manquante: ${table}`);
  assert.ok(cleanup.includes('for (const [table, column] of ownedTables)'));
});

test('la suppression locale efface les données du compte, y compris l’analyse personnelle', () => {
  for (const key of ['aurevia-copilot-journal-v1','aurevia-position-groups-v2','aurevia-linked-journal-v2','aurevia_analysis_history','aurevia_my_analysis']) assert.ok(auth.includes(key));
  assert.ok(auth.includes('bindLocalDataOwner(session.user?.id)'));
  assert.ok(auth.includes('if(previous&&previous!==id)clearLocalAccountData()'));
});

test('la révocation partagée invalide toutes les sessions avant le nettoyage', () => {
  assert.ok(cleanup.includes('aurevia_account_revoke_all_sessions'));
  assert.ok(cleanup.indexOf('revokeAllAureviaSessions(base, serviceKey, userId)') < cleanup.indexOf('for (const [table, column] of ownedTables)'));
  assert.ok(sharedRevocationMigration.includes('aurevia_account_revoke_all_sessions'));
  assert.ok(sharedRevocationMigration.includes('grant execute on function public.aurevia_account_revoke_all_sessions(uuid) to service_role'));
  assert.ok(sharedRevocationMigration.includes('revoked_at = now()'));
});

test('bootstrap, révocation de rôle et suppression de compte partagent le verrou anti-concurrence', () => {
  assert.ok(guardedDeletionMigration.includes('create or replace function public.aurevia_bootstrap_admin'));
  assert.ok(guardedDeletionMigration.includes('create or replace function public.aurevia_admin_manage'));
  assert.equal(guardedDeletionMigration.split("pg_advisory_xact_lock(hashtextextended('aurevia:last-admin-protection', 0))").length - 1, 3);
  assert.ok(guardedDeletionMigration.includes('grant execute on function public.aurevia_account_delete_guarded(uuid) to service_role'));
});
