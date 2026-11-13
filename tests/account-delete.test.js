import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const endpoint = await read('../netlify/functions/account-delete.mjs');
const admin = await read('../netlify/functions/admin-api.mjs');
const cleanup = await read('../netlify/functions/_account-deletion.mjs');
const auth = await read('../auth.js');
const sharedRevocationMigration = await read('../supabase/migrations/20261113100000_shared_account_deletion_session_revocation.sql');

test('la suppression personnelle vérifie le jeton Supabase sans dépendre du heartbeat', () => {
  assert.ok(endpoint.includes('verifyBearerUser(event)'));
  assert.ok(!endpoint.includes('assertActiveSession'));
  assert.ok(endpoint.includes('context.user.id'));
  assert.ok(endpoint.includes('/auth/v1/admin/users/'));
});

test('la suppression exige la confirmation explicite SUPPRIMER', () => {
  assert.ok(endpoint.includes("body.confirmation!=='SUPPRIMER'"));
});

test('la suppression personnelle purge les données AUREVIA avant de supprimer l’identité Auth', () => {
  assert.ok(endpoint.includes('deleteUserApplicationData'));
  assert.ok(endpoint.indexOf('deleteUserApplicationData') < endpoint.indexOf('/auth/v1/admin/users/'));
  assert.ok(endpoint.includes('application_data_deleted:true'));
});

test('la suppression administrative purge aussi les données personnelles et révoque la session', () => {
  assert.ok(admin.includes('deleteUserApplicationData'));
  const start = admin.indexOf("if(action==='delete_user')");
  const end = admin.indexOf("if(action==='announcement_create')", start);
  const block = admin.slice(start, end);
  assert.ok(block.includes('aurevia_admin_revoke_session'));
  assert.ok(block.includes('application_data_deleted:true'));
  assert.ok(block.indexOf('deleteUserApplicationData') < block.indexOf('/auth/v1/admin/users/'));
});

test('le nettoyage couvre les données métier, préférences, annonces ciblées et Telegram', () => {
  for (const table of [
    'announcement_reads', 'announcement_recipients', 'aurevia_analysis_scenarios',
    'aurevia_trade_alert_events', 'telegram_connections', 'user_preferences',
    'trading_position_closes', 'trading_positions', 'trading_position_groups',
    'trading_journal', 'profiles'
  ]) assert.ok(cleanup.includes(`'${table}'`), `table manquante: ${table}`);
  assert.ok(cleanup.includes('for (const [table, column] of ownedTables)'));
});

test('la suppression locale efface aussi le jeton mémorisé sur cet appareil', () => {
  assert.ok(auth.includes('forgetAccountSession(String(email).toLowerCase());saveRememberedAccounts('));
  assert.ok(auth.includes('Une nouvelle inscription sera nécessaire.'));
  for (const key of ['aurevia-copilot-journal-v1','aurevia-position-groups-v2','aurevia-linked-journal-v2','aurevia_analysis_history','aurevia_my_analysis']) assert.ok(auth.includes(key));
  assert.ok(auth.includes('bindLocalDataOwner(session.user?.id)'));
  assert.ok(auth.includes('if(previous&&previous!==id)clearLocalAccountData()')); 
});


test('la suppression personnelle et administrative passent par la révocation partagée de toutes les sessions', () => {
  assert.ok(cleanup.includes('aurevia_account_revoke_all_sessions'));
  assert.ok(cleanup.indexOf('revokeAllAureviaSessions(base, serviceKey, userId)') < cleanup.indexOf('for (const [table, column] of ownedTables)'));
  assert.ok(sharedRevocationMigration.includes('aurevia_account_revoke_all_sessions'));
  assert.ok(sharedRevocationMigration.includes('grant execute on function public.aurevia_account_revoke_all_sessions(uuid) to service_role'));
  assert.ok(sharedRevocationMigration.includes('revoked_at = now()')); 
});
