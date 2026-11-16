import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../netlify/functions/scenario-api.mjs',import.meta.url),'utf8');
const watch=readFileSync(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
const webhook=readFileSync(new URL('../netlify/functions/telegram-webhook.mjs',import.meta.url),'utf8');
test('l’enregistrement direct dans AUREVIA n’est proposé qu’après validation M5',()=>{
 assert.match(app,/s\.status==='entry_confirmed'/);
 assert.match(app,/Proposition M5 validée par les trois IA|confirmée par M5/i);
 assert.match(api,/scenario\.status!=='entry_confirmed'/);
 assert.match(api,/validée par l’analyse M5 après mitigation/i);
 assert.match(watch,/runAureviaM5Confirmation/);assert.match(watch,/rpc\/aurevia_claim_m5_analysis/);
 assert.doesNotMatch(watch,/evaluateMitigationEntryConfirmation|candles\(s\.instrument,'1min'/);
});
test('le mode direct utilise la même RPC transactionnelle que Telegram',()=>{
 assert.match(api,/rpc\/aurevia_create_position_from_scenario/);
 assert.match(api,/p_scenario_id:scenarioId,p_user_id:user,p_mode:mode,p_volume:volume,p_contract_spec:contractSpec,p_broker_snapshot:brokerSnapshot/);
 assert.match(webhook,/rpc\/aurevia_create_position_from_scenario/);
});
test('la création vérifie l’appartenance utilisateur, l’expiration et empêche un doublon',()=>{
 assert.match(api,/user_id=eq\.\$\{user\}/);
 assert.match(api,/scenario\.trade_group_id/);
 assert.match(api,/lot_confirmation_expires_at/);
});
test('l’interface dédiée est ouverte uniquement depuis un scénario confirmé et propose les deux modes',()=>{
 assert.match(app,/function openTradeValidation\(scenario\)/);
 assert.match(app,/data-scenario-validate/);
 assert.match(app,/validationLot/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/value="unique"/);
 assert.match(html,/value="separate"/);
 assert.doesNotMatch(app,/validationBroker|validationAccountType/);
 assert.match(app,/validationContractSpec/);
 assert.match(app,/brokerSnapshot=\{accountCurrency:checked\.spec\.accountCurrency,leverage:checked\.spec\.leverage\}/);
});
test('la case journal de l’interface est transmise à la base et respectée transactionnellement',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/migrations/20261115024336_scenario_registration_auto_journal.sql',import.meta.url),'utf8');
 assert.match(html,/id="validationAutoJournal" type="checkbox" checked/);
 assert.match(app,/auto_journal:\$\('validationAutoJournal'\)\.checked/);
 assert.match(api,/p_auto_journal:body\.auto_journal!==false/);
 assert.match(migration,/p_auto_journal boolean/);
 assert.match(migration,/coalesce\(p_auto_journal,true\) and p_mode='unique'/);
 assert.match(migration,/coalesce\(p_auto_journal,true\) and p_mode='separate'/);
});
test('la migration SQL valide la devise du profil sans exiger de broker ni de type de compte',()=>{
 const migration=readFileSync(new URL('../supabase/migrations/20261115030047_trade_validation_profile_currency_no_broker_fields.sql',import.meta.url),'utf8');
 assert.match(migration,/PROFILE_ACCOUNT_CURRENCY_REQUIRED/);
 assert.match(migration,/PROFILE_ACCOUNT_CURRENCY_MISMATCH/);
 assert.doesNotMatch(migration,/brokerName|accountType|BROKER_ACCOUNT_SETTINGS_REQUIRED/);
 assert.match(migration,/p_auto_journal boolean/);
 assert.match(migration,/p_broker_snapshot jsonb\n\) returns uuid/);
 assert.match(migration,/p_scenario_id, p_user_id, p_mode, p_volume/);
 assert.match(migration,/grant execute on function public\.aurevia_create_position_from_scenario/);
});

test('le canal Telegram conserve le parcours de confirmation du lot dans le bot',()=>{
 assert.match(webhook,/start:\(\[A-F0-9\]\{8\}\):\(unique\|separate\)/);
 assert.match(watch,/inline_keyboard/);
});

test('la surveillance ne peut être créée sans une confrontation correspondant à la zone et à la direction',()=>{
 assert.match(app,/aurevia_last_confrontation/);
 assert.match(app,/confrontation\.instrument!==instrument/);
 assert.match(app,/currentAnalysis\.zoneLow/);
 assert.match(app,/Confrontez d’abord votre zone d’entrée/);
});

test('la confirmation d’un scénario exige un prix récent et un marché ouvert',()=>{
 assert.match(api,/getMarketStatus/);
 assert.match(api,/scenario\.last_price_at/);
 assert.match(api,/quoteAge>120000/);
 assert.match(webhook,/scenario\.last_price_at/);
 assert.match(webhook,/quoteAge>120000/);
 assert.match(watch,/last_price_at:quote\.quoteAt/);
});
test('la base bloque elle-même la création d’un trade à partir d’un prix périmé',()=>{
 const migration=readFileSync(new URL('../supabase/migrations/20261116112758_aurevia_require_fresh_scenario_price_for_trade.sql',import.meta.url),'utf8');
 assert.match(migration,/before update of trade_group_id/i);
 assert.match(migration,/SCENARIO_PRICE_STALE/);
 assert.match(migration,/interval '2 minutes'/);
});


test('la validation manuelle affiche le type d’ordre et les niveaux Stop/Limit proposés par M5',()=>{
 assert.match(app,/Type d’ordre/);
 assert.match(app,/Déclenchement/);
 assert.match(app,/Prix limite/);
 assert.match(app,/Prix proposé par l’IA M5/);
});


test('les données privées sont réinitialisées lorsqu’un autre compte devient propriétaire du stockage local',()=>{
 const auth=readFileSync(new URL('../auth.js',import.meta.url),'utf8');
 assert.match(auth,/aurevia:localownerchange/);
 assert.match(auth,/aurevia-cloud-sync-retry-v1/);
 assert.match(auth,/previousQueueKey/);
 assert.match(auth,/LOCAL_ACCOUNT_SNAPSHOT_PREFIX/);
 assert.match(auth,/snapshotLocalAccountData\(previous\)/);
 assert.match(auth,/restoreLocalAccountData\(id\)/);
 assert.match(app,/tradeSyncQueueStorageKey\(\)/);
 assert.match(app,/aurevia_local_data_owner_id/);
 assert.match(auth,/aurevia_active_session_id/);
 assert.match(app,/window\.addEventListener\('aurevia:localownerchange'/);
 assert.match(app,/restoreMyAnalysis\(\);restoreScenarioDraft\(\)/);
 assert.match(app,/renderPositions\(\);renderLinkedJournal\(\);restoreMyAnalysis\(\)/);
 assert.match(app,/syncManualJournalToSupabase\(loadJournalTrades\(\),/);
 assert.match(app,/Aucune analyse personnelle enregistrée sur cet appareil/);
 assert.match(app,/Aucun brouillon local à restaurer/);
 assert.match(app,/event\.detail\?\.event==='SIGNED_IN'&&wasBooted/);
});

test('le formulaire de validation ne contient qu’un seul champ de prix réel et l’exige pour MARKET',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal((html.match(/id="validationActualFillField"/g)||[]).length,1);
 assert.equal((html.match(/id="validationActualFill"/g)||[]).length,1);
 assert.match(app,/validationActualFill'\)\.required=isMarketOrder/);
 assert.match(app,/isMarketOrder&&actualEntryPrice===null/);
});
