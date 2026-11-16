import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261111232136_aurevia_single_session_admin_console_v229.sql',import.meta.url),'utf8');

test('RLS session wrapper can only inspect the caller JWT session',()=>{
 const wrapper=migration.match(/create or replace function public\.aurevia_session_is_active\(\)[\s\S]*?\$\$;/i)?.[0]||'';
 assert.ok(wrapper,'session wrapper migration definition exists');
 assert.match(wrapper,/auth\.uid\(\)/i);
 assert.match(wrapper,/auth\.jwt\(\)->>'session_id'/i);
 assert.match(wrapper,/aurevia_session_is_active_for_user\(auth\.uid\(\)/i);
 assert.doesNotMatch(wrapper,/p_user_id|p_session_id|current_setting\([^)]*user_id/i);
 assert.match(migration,/revoke all on function public\.aurevia_session_is_active\(\) from public,\s*anon/i);
 assert.match(migration,/grant execute on function public\.aurevia_session_is_active\(\) to authenticated/i);
});

test('the parameterized session lookup remains service-role only',()=>{
 const helper=migration.match(/create or replace function public\.aurevia_session_is_active_for_user\(p_user_id uuid,p_session_id uuid\)[\s\S]*?\$\$;/i)?.[0]||'';
 assert.ok(helper,'parameterized session lookup migration definition exists');
 assert.match(helper,/where s\.user_id=p_user_id and s\.session_id=p_session_id/i);
 assert.match(migration,/revoke all on function public\.aurevia_session_is_active_for_user\(uuid,uuid\) from public,\s*anon,\s*authenticated/i);
 assert.match(migration,/grant execute on function public\.aurevia_session_is_active_for_user\(uuid,uuid\) to service_role/i);
});

test('session RLS policies use the current-session wrapper',()=>{
 assert.match(migration,/public\.aurevia_session_is_active\(\)/i);
 assert.match(migration,/ALTER POLICY/i);
});
