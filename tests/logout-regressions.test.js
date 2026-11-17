import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../auth.js',import.meta.url),'utf8');
test('logout is bound before Supabase session restoration can delay initialization',()=>{
 const init=source.slice(source.indexOf('export async function initAuth()'));
 const bind=init.indexOf("signOutButton.addEventListener('click',performSignOut)");
 const ensure=init.indexOf('await ensureClient()');
 assert.ok(bind>=0);assert.ok(ensure>=0);assert.ok(bind<ensure);
});
test('logout attempts local sign-out and clears the local active-session state',()=>{
 assert.match(source,/supabase\.auth\.signOut\(\{scope:'local'\}\)/);
 assert.match(source,/localStorage\.removeItem\('aurevia_active_session_id'\)/);
 assert.match(source,/showInAppNotice\('Déconnexion effectuée\.'/);
});
