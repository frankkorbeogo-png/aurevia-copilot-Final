import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261117141536_aurevia_require_manual_actual_fill_for_market_pnl.sql',import.meta.url),'utf8');

test('la base bloque une entrée MARKET sans prix réel d’exécution manuelle',()=>{
 assert.match(migration,/upper\(coalesce\(new\.order_type,''\)\)='MARKET'/);
 assert.match(migration,/new\.actual_entry_price is null or new\.actual_entry_price<=0/);
 assert.match(migration,/ACTUAL_FILL_PRICE_REQUIRED/);
 assert.match(migration,/before insert or update of order_type, actual_entry_price/i);
});

test('les ordres conditionnels peuvent être enregistrés avant activation',()=>{
 assert.match(migration,/and \(new\.actual_entry_price is null or new\.actual_entry_price<=0\)/);
 assert.match(migration,/order_type,''\)\)='MARKET'/);
});
