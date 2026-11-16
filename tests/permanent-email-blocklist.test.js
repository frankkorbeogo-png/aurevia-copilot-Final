import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261116110000_aurevia_permanent_email_blocklist.sql',import.meta.url),'utf8');
const enforcement=await readFile(new URL('../supabase/migrations/20261116111000_aurevia_enforce_email_block_before_auth_insert.sql',import.meta.url),'utf8');

test('permanent blocklist stores only a keyed HMAC fingerprint, never the raw email',()=>{
 assert.match(migration,/email_fingerprint text primary key/i);
 assert.match(migration,/extensions\.hmac\(convert_to\(v_email,'UTF8'\),v_secret,'sha256'\)/i);
 assert.match(migration,/extensions\.gen_random_bytes\(32\)/i);
 assert.match(migration,/revoke all on app_private\.aurevia_blocked_emails from public, anon, authenticated, service_role/i);
 assert.doesNotMatch(migration,/email text[^;]*aurevia_blocked_emails/i);
});

test('only a verified admin may create an irreversible email block',()=>{
 assert.match(migration,/aurevia_admin_permanent_delete_block\(p_actor_id uuid,p_target_user_id uuid/i);
 assert.match(migration,/public\.aurevia_is_admin\(p_user_id=>p_actor_id\)/i);
 assert.match(migration,/ADMIN_ACCOUNT_PROTECTED/i);
 assert.match(migration,/grant execute on function public\.aurevia_admin_permanent_delete_block\(uuid,uuid,text\) to service_role/i);
 assert.match(migration,/revoke all on function public\.aurevia_admin_permanent_delete_block\(uuid,uuid,text\) from public, anon, authenticated/i);
});

test('Auth rejects blocked addresses at insert and email change, not only in the UI',()=>{
 assert.match(enforcement,/before insert or update of email on auth\.users/i);
 assert.match(enforcement,/app_private\.aurevia_email_fingerprint\(new\.email\)/i);
 assert.match(enforcement,/aurevia_blocked_emails/i);
 assert.match(enforcement,/errcode='23514'/i);
});

test('the ordinary account deletion endpoint remains independent from the email blocklist',async()=>{
 const endpoint=await readFile(new URL('../netlify/functions/account-delete.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(endpoint,/aurevia_admin_permanent_delete_block|aurevia_blocked_emails/);
});
