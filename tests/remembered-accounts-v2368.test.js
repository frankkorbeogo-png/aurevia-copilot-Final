import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('les comptes mémorisés sont normalisés, dédupliqués et limités à deux',async()=>{
 const s=await read('auth.js');
 assert.match(s,/aurevia_remembered_accounts_v1/);
 assert.match(s,/if\(out\.length===2\)break/);
 assert.match(s,/if\(list\.length>=2\)return false/);
 assert.match(s,/Deux comptes sont déjà mémorisés/);
});
test('chaque compte mémorisé peut être sélectionné et retiré sans supprimer le compte AUREVIA',async()=>{
 const s=await read('auth.js'),h=await read('index.html');
 assert.match(h,/rememberedAccountsHost/);
 assert.match(s,/restoreRememberedSession\(account\.email,login\)/);
 assert.match(s,/aurevia_account_sessions_v1/);
 assert.match(s,/supabase\.auth\.setSession/);
 assert.match(s,/login_hint=expected/);
 assert.match(s,/Retirer uniquement de la mémoire de cet appareil/);
 assert.match(s,/Le compte AUREVIA et ses données ne seront pas supprimés/);
});
test('les mots de passe et jetons ne sont jamais stockés dans la liste mémorisée',async()=>{
 const s=await read('auth.js');
 assert.match(s,/email,name:String/);
 assert.doesNotMatch(s,/remembered.*password|password.*remembered/i);
 assert.match(s,/persistSession:true,autoRefreshToken:true/);
});
test('la déconnexion conserve les comptes mémorisés tandis que la suppression définitive retire le compte local',async()=>{
 const s=await read('auth.js');
 const signOut=s.slice(s.indexOf("$('signOutBtn')"),s.indexOf("$('deleteOwnAccountBtn')"));
 assert.doesNotMatch(signOut,/removeItem\(REMEMBERED_ACCOUNTS_KEY/);
 assert.match(signOut,/renderRememberedAccounts\(\)/);
 assert.match(s,/saveRememberedAccounts\(getRememberedAccounts\(\)\.filter\(x=>x\.email!==String\(email\)\.toLowerCase\(\)\)\)/);
});

test('la porte de connexion annonce Google OAuth uniquement, sans mot de passe AUREVIA',async()=>{
 const h=await read('index.html'),s=await read('auth.js');
 assert.match(h,/exclusivement avec votre compte Google/);
 assert.match(h,/Aucun mot de passe AUREVIA n’est à créer ni à mémoriser/);
 assert.match(s,/signInWithOAuth\(\{provider:'google'/);
 assert.doesNotMatch(h,/id=["'](?:password|aureviaPassword)["']/i);
});
