import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Telegram guide la saisie avec des boutons, valide le code et crée via la RPC protégée',async()=>{
 const source=await read('../netlify/functions/telegram-webhook.mjs');
 assert.match(source,/callback_query/);
 assert.match(source,/callback_data/);
 assert.match(source,/telegram_trade_setup/);
 assert.match(source,/validateContractSpec/);
 assert.match(source,/rpc\/aurevia_create_position_from_scenario/);
 assert.match(source,/Aucun ordre n’a été envoyé au broker/);
});

test('la confirmation M15 propose les deux modes avec des boutons Telegram',async()=>{
 const source=await read('../netlify/functions/scenario-watch.mjs');
 assert.match(source,/lot_confirmation_code:code/);
 assert.match(source,/lot_confirmation_expires_at:expiresAt/);
 assert.match(source,/callback_data:`start:\$\{code\}:unique`/);
 assert.match(source,/callback_data:`start:\$\{s\.lot_confirmation_code\}:separate`/);
 assert.match(source,/Aucune opération broker n’est exécutée/);
});

test('la création atomique est réservée au service_role et valide les paramètres instrument',async()=>{
 const sql=await read('../supabase/migrations/20261113140000_telegram_scenario_lot_confirmation_v2379.sql');
 assert.match(sql,/for update/i);
 assert.match(sql,/auth\.role\(\) <> 'service_role'/);
 assert.match(sql,/BROKER_INSTRUMENT_SETTINGS_REQUIRED/);
 assert.match(sql,/LOT_STEP_INVALID/);
 assert.match(sql,/LOT_MAX_EXCEEDED/);
 assert.match(sql,/trade_group_id=v_group/);
 assert.match(sql,/grant execute .* to service_role/i);
 assert.match(sql,/revoke all .*authenticated/i);
});

test('V2.3.80 stocke le snapshot de calcul et prend en charge contrat, point et tick',async()=>{const sql=await read('../supabase/migrations/20261113142328_universal_contract_snapshot_v2380.sql');assert.match(sql,/add column if not exists contract_spec jsonb/i);assert.match(sql,/add column if not exists broker_snapshot jsonb/i);assert.match(sql,/p_contract_spec jsonb/i);assert.match(sql,/v_calc='point'/i);assert.match(sql,/v_calc='tick'/i);assert.match(sql,/grant execute .* to service_role/i);});
