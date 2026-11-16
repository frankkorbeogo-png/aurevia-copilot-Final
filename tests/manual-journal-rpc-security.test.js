import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261116221000_aurevia_manual_journal_rpcs_security_invoker.sql',import.meta.url),'utf8');

test('les RPC du journal manuel s’appuient sur RLS au lieu de contourner les politiques',()=>{
  assert.match(migration,/aurevia_sync_manual_journal\(jsonb\)[\s\S]*?SECURITY INVOKER/);
  assert.match(migration,/aurevia_delete_manual_journal_entry\(uuid\)[\s\S]*?SECURITY INVOKER/);
  assert.match(migration,/SET search_path = pg_catalog, public, auth/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.aurevia_sync_manual_journal\(jsonb\)[\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.aurevia_delete_manual_journal_entry\(uuid\)[\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration,/TO authenticated, service_role/);
});

test('le contrôle de session reste dans les RPC et les politiques RLS existantes',async()=>{
  const auth=await readFile(new URL('../auth.js',import.meta.url),'utf8');
  assert.match(auth,/supabase\.rpc\('aurevia_sync_manual_journal'/);
  assert.match(auth,/supabase\.rpc\('aurevia_delete_manual_journal_entry'/);
  assert.match(migration,/SECURITY INVOKER/);
});
