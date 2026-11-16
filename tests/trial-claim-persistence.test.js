import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261116154448_aurevia_trial_claim_persists_after_account_deletion.sql',import.meta.url),'utf8');
const activation=await readFile(new URL('../supabase/migrations/20261116154456_aurevia_license_activation_requires_verified_email.sql',import.meta.url),'utf8');

test('trial claim is permanent per normalized verified email',()=>{
 assert.match(migration,/create table public\.aurevia_trial_claims/i);
 assert.match(migration,/email_hash text primary key/i);
 assert.match(migration,/extensions\.digest\(lower\(btrim\(u\.email\)\),'sha256'\)/i);
 assert.match(migration,/email_confirmed_at is null/i);
 assert.match(migration,/on conflict\(email_hash\) do nothing/i);
 assert.match(migration,/where email_hash=v_email_hash for update/i);
 assert.match(migration,/v_now\+interval '3 days'/i);
});

test('deleting an auth user does not delete the trial claim',()=>{
 assert.match(migration,/first_user_id uuid references auth\.users\(id\) on delete set null/i);
 assert.doesNotMatch(migration,/on delete cascade/i);
 assert.match(migration,/alter table public\.aurevia_trial_claims enable row level security/i);
 assert.match(migration,/revoke all on table public\.aurevia_trial_claims from public, anon, authenticated/i);
});

test('license status preserves the same trial start and expiry for a recreated account',()=>{
 assert.match(migration,/trial_started_at is distinct from v_claim\.trial_started_at/i);
 assert.match(migration,/trial_expires_at is distinct from v_claim\.trial_expires_at/i);
 assert.match(migration,/case when v_claim\.trial_expires_at<=v_now then 'expired' else 'trial' end/i);
 assert.match(migration,/days_remaining',0/i);
});

test('license activation requires a verified email at database level',()=>{
 assert.match(activation,/select email_confirmed_at into v_email_confirmed_at from auth\.users/i);
 assert.match(activation,/if v_email_confirmed_at is null then return jsonb_build_object\('ok',false,'code','EMAIL_NOT_VERIFIED'\)/i);
 assert.match(activation,/revoke all on function public\.aurevia_license_activate\(uuid,text\) from public,anon,authenticated/i);
});
