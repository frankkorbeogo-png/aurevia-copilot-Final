import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20261111180000_single_session_and_admin_console_v229.sql',import.meta.url),'utf8');
const auth=await readFile(new URL('../auth.js',import.meta.url),'utf8');
const admin=await readFile(new URL('../netlify/functions/admin-api.mjs',import.meta.url),'utf8');
const helper=await readFile(new URL('../netlify/functions/_session-auth.mjs',import.meta.url),'utf8');
test('la migration stocke une seule session par utilisateur dans un schéma privé',()=>{assert.match(migration,/app_private\.aurevia_user_sessions[\s\S]*user_id uuid primary key/);assert.match(migration,/auth\.sessions/);assert.match(migration,/session_created_at/);});
test('les heartbeat et claims distinguent la création de session du rafraîchissement JWT',()=>{assert.match(migration,/p_claim and excluded\.session_created_at>=/);assert.match(migration,/last_seen>=now\(\)-interval '90 seconds'/);assert.match(auth,/setInterval\(async\(\)=>/);assert.match(auth,/activateSession\(session,'claim'/);});
test('les politiques RLS personnelles exigent une session AUREVIA active',()=>{assert.match(migration,/aurevia_session_is_active\(\)/);assert.match(migration,/ALTER POLICY/);assert.match(migration,/profiles','user_preferences','telegram_connections','trading_journal/);});
test('les API privées valident le JWT, l’identifiant de session et le registre serveur',()=>{assert.match(helper,/auth\/v1\/user/);assert.match(helper,/session_id/);assert.match(helper,/aurevia_session_is_active_for_user/);assert.match(admin,/assertActiveSession\(context\)/);assert.match(admin,/aurevia_is_admin/);});
test('le navigateur ne décide jamais du rôle admin depuis profiles.role',()=>{assert.doesNotMatch(auth,/select\('display_name,role'\)/);assert.match(auth,/\/api\/admin\?verify=1/);assert.match(auth,/setAdminVisibility\(allowed\)/);});

test('une panne temporaire de validation conserve la session Google et propose une nouvelle vérification',()=>{assert.match(auth,/showSessionRetry\(`La session Google est valide/);assert.match(auth,/Votre connexion est conservée/);assert.match(auth,/retrySessionBtn/);assert.doesNotMatch(auth,/catch\(error\)\{\s*await forceLocalSignOut\(error\.code==='SESSION_REPLACED'/);});
test('une session remplacée reste bloquante et provoque une déconnexion locale',()=>{assert.match(auth,/if\(error\.code==='SESSION_REPLACED'\)\{\s*await forceLocalSignOut/);});
test('la tentative de connexion avec un compte nouvellement créé appelle le refus serveur',()=>{assert.match(auth,/authIntentError==='ACCOUNT_NOT_REGISTERED'[\s\S]*?rejectAccountCreatedDuringLogin/);});
