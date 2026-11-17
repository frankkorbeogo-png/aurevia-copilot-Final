import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261116230300_aurevia_enforce_manual_fill_source.sql',import.meta.url),'utf8');

test('la RPC SQL refuse un prix M5 comme substitut au prix réel manuel',()=>{
 assert.match(migration,/if not v_pending and \(v_actual_entry is null or v_actual_entry<=0\)/);
 assert.match(migration,/else v_actual_entry/);
 assert.doesNotMatch(migration,/coalesce\(v_actual_entry,s\.entry_confirmation_price,s\.entry\)/);
 assert.match(migration,/ACTUAL_FILL_PRICE_REQUIRED/);
});

test('la base exige que le prix réel du groupe corresponde au prix déclaré dans le snapshot contractuel',()=>{
 assert.match(migration,/new\.contract_spec->>'actualEntryPrice'/);
 assert.match(migration,/new\.actual_entry_price is distinct from v_spec_actual/);
 assert.match(migration,/PENDING_ORDER_ACTUAL_FILL_NOT_ALLOWED/);
 assert.match(migration,/contract_spec=coalesce\(contract_spec,'\{\}'::jsonb\)\|\|jsonb_build_object\('actualEntryPrice',p_actual_entry_price\)/);
 assert.match(migration,/before insert or update of order_type, actual_entry_price, contract_spec/i);
});
