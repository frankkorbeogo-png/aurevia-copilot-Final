import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('la suppression personnelle passe par une RPC atomique qui protège le dernier administrateur',async()=>{
 const api=await readFile(new URL('../netlify/functions/account-delete.mjs',import.meta.url),'utf8');
 const sql=await readFile(new URL('../supabase/migrations/20261116154543_aurevia_guard_last_admin_account_deletion.sql',import.meta.url),'utf8');
 assert.match(api,/rpc\/aurevia_account_delete_guarded/);
 assert.match(api,/LAST_ADMIN_PROTECTED/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/LAST_ADMIN_PROTECTED/);
 assert.match(sql,/delete from auth\.users/);
 assert.match(sql,/aurevia_admin_manage/);
 assert.match(sql,/aurevia_bootstrap_admin/);
});
