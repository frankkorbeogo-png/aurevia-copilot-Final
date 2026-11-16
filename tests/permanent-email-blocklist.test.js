import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261116104632_aurevia_permanent_email_blocklist.sql',import.meta.url),'utf8');
const enforcement=await readFile(new URL('../supabase/migrations/20261116104657_aurevia_enforce_email_block_before_auth_insert.sql',import.meta.url),'utf8');

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

test('le blocage définitif et la révocation de session sont atomiques côté SQL',async()=>{
 const atomic=await readFile(new URL('../supabase/migrations/20261116105029_aurevia_permanent_delete_atomic_session_revoke.sql',import.meta.url),'utf8');
 assert.match(atomic,/update app_private\.aurevia_user_sessions/i);
 assert.match(atomic,/revoked_at=now\(\)/i);
 assert.match(atomic,/insert into app_private\.admin_audit_log/i);
 assert.match(atomic,/return jsonb_build_object\('ok',true,'email_blocked',true,'new_block',v_inserted,'session_revoked',v_session_revoked\)/i);
});


test('permanent email blocks are checked by every license-status call before trial or license access',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261116223000_aurevia_license_status_enforces_email_blocklist.sql',import.meta.url),'utf8');
 const blockCheck=sql.indexOf('from app_private.aurevia_blocked_emails');
 const accessInsert=sql.indexOf('insert into public.aurevia_account_access');
 const trialInsert=sql.indexOf('insert into public.aurevia_trial_claims');
 assert.ok(blockCheck>=0);
 assert.ok(accessInsert>blockCheck,'blocked emails must be rejected before account access is recreated');
 assert.ok(trialInsert>blockCheck,'blocked emails must be rejected before a trial claim can be created');
 assert.match(sql,/app_private\.aurevia_email_fingerprint\(v_email\)/);
 assert.match(sql,/code','EMAIL_BLOCKED'/);
});


test('a permanently blocked email cannot consume or activate a license key',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261116230000_aurevia_license_activation_respects_email_blocklist.sql',import.meta.url),'utf8');
 const blockCheck=sql.indexOf('from app_private.aurevia_blocked_emails');
 const licenseLookup=sql.indexOf('from public.aurevia_licenses');
 assert.ok(blockCheck>=0);
 assert.ok(licenseLookup>blockCheck,'license lookup must happen only after the blocklist check');
 assert.match(sql,/code','EMAIL_BLOCKED'/);
 assert.match(sql,/grant execute on function public\.aurevia_license_activate\(uuid,text\) to service_role/i);
});
