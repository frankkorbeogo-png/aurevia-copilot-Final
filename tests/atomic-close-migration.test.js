import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('la clôture cloud utilise une RPC transactionnelle et idempotente',async()=>{
 const auth=await readFile(new URL('../auth.js',import.meta.url),'utf8');
 const migration=await readFile(new URL('../supabase/migrations/20261112100000_atomic_position_close_v232.sql',import.meta.url),'utf8');
 const fn=auth.slice(auth.indexOf('export async function syncTradeCloseToSupabase('),auth.indexOf('export async function sendTelegramTest'));
 assert.match(fn,/supabase\.rpc\('aurevia_record_position_close'/);
 assert.doesNotMatch(fn,/from\('trading_position_closes'\)/);
 assert.match(migration,/for update/i);
 assert.match(migration,/if found then[\s\S]*duplicate/);
 assert.match(migration,/trading_journal/);
 assert.match(migration,/volume_remaining/);
});
