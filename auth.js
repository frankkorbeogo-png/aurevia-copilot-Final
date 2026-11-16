import { resolveLinkedJournalStatus, buildTradeGroupCloudRows } from './trade-management.js';
const SUPABASE_URL='https://imkwbizyblzuevkodzqc.supabase.co';
// Publishable key: designed for browser use. Row access is still controlled by Supabase RLS.
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_DSlEiHcRGUKc5XjGeHz7jQ_n8EUMw6v';
let supabase=null;
async function ensureClient(){if(!supabase){const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.119.0');supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}return supabase;}
async function ensureUser(){await ensureClient();const {data,error}=await supabase.auth.getUser();if(error)throw new Error(error.message);currentUser=data.user||null;return currentUser;}
const $=id=>document.getElementById(id);
let currentUser=null,currentProfile=null,adminVerified=false,sessionReady=false,heartbeatTimer=null,profileRefreshSequence=0,pendingSession=null,sessionActivationBusy=false;
window.__aureviaAuthenticated=false;document.body.classList.add('auth-required');
window.__aureviaAdminVerified=null;
function showStatus(message,isError=false){const el=$('authStatus');if(el){el.textContent=message;el.dataset.state=isError?'error':'ok';}}
const REMEMBERED_ACCOUNTS_KEY='aurevia_remembered_accounts_v1';
const ACCOUNT_SESSIONS_KEY='aurevia_account_sessions_v1';
const LOCAL_DATA_OWNER_KEY='aurevia_local_data_owner_id';
const LOCAL_ACCOUNT_DATA_KEYS=[
 'aurevia-copilot-journal-v1','aurevia-position-groups-v2','aurevia-linked-journal-v2','aurevia_active_session_id',
 'aurevia_last_telegram_analysis','aurevia_scenario_summary_draft','aurevia_last_confrontation',
 'aurevia_analysis_history','aurevia_my_analysis'
];
const LEGACY_TRADE_SYNC_QUEUE_KEY='aurevia-cloud-sync-retry-v1';
const LOCAL_ACCOUNT_SNAPSHOT_PREFIX='aurevia_account_data_v1:';
function snapshotLocalAccountData(userId){if(!userId)return;try{const snapshot={};for(const key of LOCAL_ACCOUNT_DATA_KEYS){if(key==='aurevia_active_session_id')continue;const value=localStorage.getItem(key);if(value!==null)snapshot[key]=value;}localStorage.setItem(`${LOCAL_ACCOUNT_SNAPSHOT_PREFIX}${userId}`,JSON.stringify(snapshot));}catch{}}
function restoreLocalAccountData(userId){if(!userId)return;try{const raw=localStorage.getItem(`${LOCAL_ACCOUNT_SNAPSHOT_PREFIX}${userId}`);if(!raw)return;const snapshot=JSON.parse(raw);for(const key of LOCAL_ACCOUNT_DATA_KEYS){if(key==='aurevia_active_session_id')continue;if(typeof snapshot?.[key]==='string')localStorage.setItem(key,snapshot[key]);}}catch{}}
function clearLocalAccountData(tradeQueueUserId=null){try{for(const key of LOCAL_ACCOUNT_DATA_KEYS)localStorage.removeItem(key);if(tradeQueueUserId){localStorage.removeItem(`${LEGACY_TRADE_SYNC_QUEUE_KEY}:${tradeQueueUserId}`);localStorage.removeItem(LEGACY_TRADE_SYNC_QUEUE_KEY);localStorage.removeItem(`${LOCAL_ACCOUNT_SNAPSHOT_PREFIX}${tradeQueueUserId}`);}}catch{}}
function bindLocalDataOwner(userId){
 const id=String(userId||'').trim();if(!id)return;
 try{
  const previous=localStorage.getItem(LOCAL_DATA_OWNER_KEY);
  if(previous&&previous!==id){
   snapshotLocalAccountData(previous);
   const legacyQueue=localStorage.getItem(LEGACY_TRADE_SYNC_QUEUE_KEY);if(legacyQueue){const previousQueueKey=`${LEGACY_TRADE_SYNC_QUEUE_KEY}:${previous}`;if(!localStorage.getItem(previousQueueKey))localStorage.setItem(previousQueueKey,legacyQueue);localStorage.removeItem(LEGACY_TRADE_SYNC_QUEUE_KEY);}
   clearLocalAccountData();restoreLocalAccountData(id);
   localStorage.setItem(LOCAL_DATA_OWNER_KEY,id);window.__aureviaUserId=id;
   window.dispatchEvent(new CustomEvent('aurevia:localownerchange',{detail:{previousUserId:previous,userId:id}}));return;
  }
  if(!previous){
   const hasUnownedData=LOCAL_ACCOUNT_DATA_KEYS.some(key=>key!=='aurevia_active_session_id'&&localStorage.getItem(key)!==null);
   if(hasUnownedData){clearLocalAccountData();window.dispatchEvent(new CustomEvent('aurevia:localownerchange',{detail:{previousUserId:null,userId:id}}));}
   if(localStorage.getItem(LEGACY_TRADE_SYNC_QUEUE_KEY))localStorage.removeItem(LEGACY_TRADE_SYNC_QUEUE_KEY);restoreLocalAccountData(id);
  }
  localStorage.setItem(LOCAL_DATA_OWNER_KEY,id);window.__aureviaUserId=id;
 }catch{}
}
function readAccountSessions(){try{const v=JSON.parse(localStorage.getItem(ACCOUNT_SESSIONS_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function cacheAccountSession(session){const email=String(session?.user?.email||'').trim().toLowerCase();if(!email||!session?.access_token||!session?.refresh_token)return;try{const all=readAccountSessions();all[email]={access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at||null,updated_at:Date.now()};const allowed=new Set(getRememberedAccounts().map(x=>x.email));for(const key of Object.keys(all))if(!allowed.has(key))delete all[key];localStorage.setItem(ACCOUNT_SESSIONS_KEY,JSON.stringify(all));}catch{}}
function forgetAccountSession(email){try{const all=readAccountSessions();delete all[String(email||'').trim().toLowerCase()];localStorage.setItem(ACCOUNT_SESSIONS_KEY,JSON.stringify(all));}catch{}}
async function restoreRememberedSession(email,btn){const key=String(email||'').trim().toLowerCase(),saved=readAccountSessions()[key];if(!saved?.refresh_token||!saved?.access_token){startRememberedLogin(key,btn);return;}btn.disabled=true;const old=btn.textContent;btn.textContent='Restauration…';try{const {data,error}=await supabase.auth.setSession({access_token:saved.access_token,refresh_token:saved.refresh_token});if(error)throw error;if(!data.session)throw new Error('Session mémorisée expirée.');if(String(data.session.user?.email||'').toLowerCase()!==key)throw new Error('Le compte restauré ne correspond pas au compte choisi.');cacheAccountSession(data.session);await activateSession(data.session,'claim');}catch(error){forgetAccountSession(key);showStatus('La session mémorisée a expiré. Une nouvelle connexion Google est nécessaire : '+(error.message||''),true);startRememberedLogin(key,btn);}finally{btn.disabled=false;btn.textContent=old;}}

let googleAuthStarter=null;
export function normalizeRememberedAccounts(raw){
 let list=[];try{list=Array.isArray(raw)?raw:JSON.parse(raw||'[]');}catch{return [];}
 if(!Array.isArray(list))return [];
 const seen=new Set(),out=[];
 for(const item of list){const email=String(item?.email||'').trim().toLowerCase();if(!email||seen.has(email))continue;seen.add(email);out.push({email,name:String(item?.name||email).slice(0,120),avatar:String(item?.avatar||'').startsWith('https://')?String(item.avatar).slice(0,500):''});if(out.length===2)break;}
 return out;
}
function getRememberedAccounts(){try{return normalizeRememberedAccounts(localStorage.getItem(REMEMBERED_ACCOUNTS_KEY));}catch{return [];}}
function saveRememberedAccounts(list){try{localStorage.setItem(REMEMBERED_ACCOUNTS_KEY,JSON.stringify(normalizeRememberedAccounts(list)));}catch{}renderRememberedAccounts();}
function rememberAccount(user){const email=String(user?.email||'').trim().toLowerCase();if(!email)return false;const list=getRememberedAccounts(),existing=list.findIndex(x=>x.email===email);const record={email,name:user.user_metadata?.full_name||user.user_metadata?.name||email,avatar:user.user_metadata?.avatar_url||user.user_metadata?.picture||''};if(existing>=0){list[existing]={...list[existing],...record};saveRememberedAccounts(list);return true;}if(list.length>=2)return false;list.push(record);saveRememberedAccounts(list);return true;}
function renderRememberedAccounts(){
 const host=$('rememberedAccountsHost');if(!host)return;const list=getRememberedAccounts();host.replaceChildren();
 const heading=document.createElement('div');heading.className='remembered-heading';heading.textContent=list.length?'Comptes mémorisés sur cet appareil':'Aucun compte mémorisé sur cet appareil';host.append(heading);
 list.forEach(account=>{const card=document.createElement('div');card.className='remembered-account';const identity=document.createElement('div');identity.className='remembered-identity';if(account.avatar){const img=document.createElement('img');img.src=account.avatar;img.alt='';img.referrerPolicy='no-referrer';identity.append(img);}const info=document.createElement('div');const name=document.createElement('b');name.textContent=account.name;const email=document.createElement('small');email.textContent=account.email;info.append(name,email);identity.append(info);const actions=document.createElement('div');actions.className='remembered-actions';const login=document.createElement('button');login.type='button';login.className='primary-btn remembered-login';login.textContent=readAccountSessions()[account.email]?.refresh_token?'Utiliser ce compte':'Se reconnecter';login.addEventListener('click',()=>restoreRememberedSession(account.email,login));const remove=document.createElement('button');remove.type='button';remove.className='small-btn remembered-remove';remove.textContent='Retirer';remove.title='Retirer uniquement de la mémoire de cet appareil';remove.addEventListener('click',async()=>{const ok=await confirmInApp({title:'Retirer ce compte mémorisé ?',message:`${account.email} sera retiré de cet appareil. Le compte AUREVIA et ses données ne seront pas supprimés.`,confirmLabel:'Retirer'});if(ok){forgetAccountSession(account.email);saveRememberedAccounts(getRememberedAccounts().filter(x=>x.email!==account.email));renderRememberedAccounts();showInAppNotice('Compte mémorisé retiré de cet appareil.',{type:'success'});}});actions.append(login,remove);card.append(identity,actions);host.append(card);});
 const slots=document.createElement('p');slots.className='remembered-slots';slots.textContent=`${list.length}/2 comptes mémorisés`;
 host.append(slots);
 const add=document.createElement('button');add.type='button';add.className='secondary-btn remembered-add';add.textContent=list.length<2?'Ajouter / utiliser un autre compte':'Limite atteinte · retirez un compte pour en ajouter un autre';add.disabled=list.length>=2;add.addEventListener('click',()=>{const btn=$('googleLoginGateBtn');if(btn)startGoogleAuth(btn,'login');});host.append(add);
}
async function startRememberedLogin(email,btn){if(!googleAuthStarter){showStatus('Le service de connexion n’est pas encore prêt. Réessayez.',true);return;}await googleAuthStarter(btn,'login',email);}
export function showInAppNotice(message,{type='error',duration=5200,title=null}={}){
 const hostId='aurevia-feedback-stack';let host=document.getElementById(hostId);
 if(!host){host=document.createElement('div');host.id=hostId;host.className='aurevia-feedback-stack';host.setAttribute('aria-live','polite');host.setAttribute('aria-relevant','additions');document.body.append(host);}
 const kind=['success','error','info'].includes(type)?type:'info';
 const item=document.createElement('div');item.className=`aurevia-feedback aurevia-feedback-${kind}`;item.setAttribute('role',kind==='error'?'alert':'status');
 const icon=document.createElement('span');icon.className='aurevia-feedback-icon';icon.setAttribute('aria-hidden','true');icon.textContent=kind==='success'?'✓':kind==='error'?'!':'i';
 const copy=document.createElement('div');copy.className='aurevia-feedback-copy';
 const heading=document.createElement('strong');heading.textContent=title||({success:'Action réussie',error:'Une erreur est survenue',info:'Information'}[kind]);
 const body=document.createElement('p');body.textContent=String(message||'');copy.append(heading,body);
 const close=document.createElement('button');close.type='button';close.className='aurevia-feedback-close';close.setAttribute('aria-label','Fermer');close.textContent='×';
 item.append(icon,copy,close);host.append(item);
 const remove=()=>{if(!item.isConnected)return;item.classList.add('is-leaving');setTimeout(()=>item.remove(),180);};
 close.addEventListener('click',remove);if(duration>0)setTimeout(remove,duration);return item;
}

export function confirmInApp({title='Confirmer',message,phrase=null,confirmLabel='Confirmer',danger=false}={}){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='modal';dialog.setAttribute('aria-labelledby','aurevia-confirm-title');
  const card=document.createElement('div');card.className='modal-card';
  const heading=document.createElement('h2');heading.id='aurevia-confirm-title';heading.textContent=title;
  const text=document.createElement('p');text.className='muted';text.textContent=message||'';
  const form=document.createElement('form');form.method='dialog';form.className='form-grid';
  let input=null;if(phrase){input=document.createElement('input');input.autocomplete='off';input.placeholder=`Saisissez ${phrase}`;input.setAttribute('aria-label',`Saisissez ${phrase}`);input.className='wide';form.append(input);}
  const actions=document.createElement('div');actions.className='wide';actions.style.cssText='display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='small-btn';cancel.textContent='Annuler';
  const accept=document.createElement('button');accept.type='submit';accept.className=danger?'danger-btn':'primary-btn';accept.style.width='auto';accept.style.margin='0';accept.textContent=confirmLabel;
  actions.append(cancel,accept);form.append(actions);card.append(heading,text,form);dialog.append(card);document.body.append(dialog);
  let settled=false;const finish=value=>{if(settled)return;settled=true;try{dialog.close()}catch{}dialog.remove();resolve(value)};
  cancel.addEventListener('click',()=>finish(false));dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});form.addEventListener('submit',e=>{e.preventDefault();finish(!phrase||input.value.trim()===phrase)});
  dialog.addEventListener('click',e=>{if(e.target===dialog)finish(false)});
  if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.setAttribute('open','');dialog.style.position='fixed';dialog.style.inset='10% auto auto 50%';dialog.style.transform='translateX(-50%)';dialog.style.zIndex='9999';}
  if(input)input.focus();
 });
}

function setAdminVisibility(isAdmin){
 adminVerified=Boolean(isAdmin);window.__aureviaAdminVerified=adminVerified;
 const link=document.querySelector('[data-page="admin"]');if(link)link.hidden=!adminVerified;
 $('page-admin')?.toggleAttribute('hidden',!adminVerified);
 $('adminUnlocked')?.toggleAttribute('hidden',!adminVerified);
 window.dispatchEvent(new CustomEvent('aurevia:adminchange',{detail:{isAdmin:adminVerified}}));
}
async function sessionRequest(action,accessToken=null){
 const token=accessToken||await getAnalysisAccessToken();if(!token)throw new Error('Session Google absente.');
 const response=await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({action}),cache:'no-store'});
 const data=await response.json().catch(()=>({error:'Réponse du service de session illisible.'}));
 if(!response.ok){const error=new Error(data.error||'La session AUREVIA n’a pas pu être vérifiée.');error.code=data.code||null;error.status=response.status;throw error;}
 return data;
}
function stopHeartbeat(){if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null;}}
async function forceLocalSignOut(message){
 stopHeartbeat();sessionReady=false;pendingSession=null;setAdminVisibility(false);currentUser=null;currentProfile=null;
 try{await supabase?.auth.signOut({scope:'local'});}catch{}
 render();if(message)showStatus(message,true);
}
function showSessionRetry(message){
 stopHeartbeat();sessionReady=false;setAdminVisibility(false);
 const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;
 showStatus(message,true);render();
 const retry=$('retrySessionBtn');if(retry)retry.hidden=false;
}
function startHeartbeat(){
 stopHeartbeat();heartbeatTimer=setInterval(async()=>{
  if(!currentUser||!sessionReady)return;
  try{await sessionRequest('heartbeat');}
  catch(error){if(error.code==='SESSION_REPLACED'){await forceLocalSignOut('Votre compte a été connecté sur un autre appareil ou votre session a été révoquée. Vous avez été déconnecté.');return;}showSessionRetry(`Vérification de session temporairement impossible (${error.status||'réseau'}). Votre connexion Google est conservée ; réessayez sans vous reconnecter. Détail : ${error.message}`);}
 },30000);
}
async function verifyAdminAccess(accessToken=null){
 if(!currentUser||!sessionReady){setAdminVisibility(false);return false;}
 try{
  const token=accessToken||await getAnalysisAccessToken();if(!token){setAdminVisibility(false);return false;}
  const response=await fetch('/api/admin?verify=1',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
  if(!response.ok){setAdminVisibility(false);return false;}
  const result=await response.json().catch(()=>null);
  const allowed=result?.ok===true&&result?.isAdmin===true&&result?.user?.id===currentUser.id;
  setAdminVisibility(allowed);return allowed;
 }catch{setAdminVisibility(false);return false;}
}
async function refreshProfile(){
 const sequence=++profileRefreshSequence;
 if(!currentUser||!sessionReady){currentProfile=null;setAdminVisibility(false);return;}
 await ensureClient();
 const {data,error}=await supabase.from('profiles').select('display_name').eq('id',currentUser.id).maybeSingle();
 if(sequence!==profileRefreshSequence)return;
 if(error){currentProfile=null;setAdminVisibility(false);showStatus('Session active, mais profil non accessible. Vérifiez la migration de sécurité des sessions.',true);return;}
 currentProfile=data;
 const isAdmin=await verifyAdminAccess();if(sequence!==profileRefreshSequence)return;
 const role=$('profileRole');if(role)role.textContent=isAdmin?'Administrateur':'Utilisateur';
 const name=$('profileName');if(name)name.textContent=currentProfile?.display_name||currentUser.email||'Compte connecté';
}
function render(){
 const logged=Boolean(currentUser&&sessionReady);
 window.__aureviaAuthenticated=logged;document.body.classList.toggle('auth-required',!logged);
 const gate=$('authRequiredGate');if(gate)gate.hidden=logged;
 const gateStatus=$('authGateStatus');if(gateStatus&&logged)gateStatus.textContent='Compte Google connecté. Accès autorisé.';
 $('authSignedOut')?.toggleAttribute('hidden',logged);$('authSignedIn')?.toggleAttribute('hidden',!logged);
 if(!logged){currentProfile=null;setAdminVisibility(false);return;}
 if(adminVerified)setAdminVisibility(true);else{document.querySelector('[data-page=\"admin\"]')?.setAttribute('hidden','');$('page-admin')?.setAttribute('hidden','');}
 refreshProfile().catch(()=>setAdminVisibility(false));
}
function readJwtSessionId(accessToken){try{const payload=JSON.parse(atob(accessToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return typeof payload.session_id==='string'?payload.session_id:null;}catch{return null;}}
let consumedAuthIntent=null;
function consumeAuthIntent(user){
 let intent=null;try{intent=JSON.parse(sessionStorage.getItem('aurevia_auth_intent')||'null');}catch{}
 if(!intent)return null;
 consumedAuthIntent=intent;sessionStorage.removeItem('aurevia_auth_intent');
 const email=String(user?.email||'').trim().toLowerCase();
 if(intent.expectedEmail&&email!==String(intent.expectedEmail).trim().toLowerCase())return 'ACCOUNT_MISMATCH';
 const createdAt=Date.parse(user?.created_at||'');
 if(Number.isFinite(createdAt)&&intent.mode==='signup'&&createdAt<intent.startedAt-5000)return 'EXISTING_ACCOUNT';
 if(Number.isFinite(createdAt)&&intent.mode==='login'&&createdAt>=intent.startedAt-5000)return 'ACCOUNT_NOT_REGISTERED';
 return null;
}
async function rejectAccountCreatedDuringLogin(session,intentError){
 const response=await fetch('/api/account-reject-new-login',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`},body:JSON.stringify({confirmation:'REJECT_NEW_LOGIN',startedAt:consumedAuthIntent?.startedAt}),cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.deleted!==true)throw new Error(data.error||'Impossible de refuser ce compte non inscrit.');
 await supabase.auth.signOut({scope:'local'});sessionReady=false;currentUser=null;render();
 const message='Aucun compte AUREVIA n’est associé à cette adresse. Pour une première utilisation, choisissez « Créer un compte ». ';
 const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;showStatus(message,true);
}
async function activateSession(session,action){
 if(!session?.access_token){sessionReady=false;render();return;}
 if(sessionActivationBusy)return;
 sessionActivationBusy=true;pendingSession=session;currentUser=session.user||currentUser;
 try{
  const authIntentError=consumeAuthIntent(session.user);
  if(authIntentError==='ACCOUNT_MISMATCH'){
   pendingSession=null;await supabase.auth.signOut({scope:'local'});sessionReady=false;currentUser=null;renderRememberedAccounts();render();
   const message='Le compte Google sélectionné ne correspond pas au compte mémorisé. Choisissez le bon compte puis réessayez.';const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;showStatus(message,true);return;
  }
  if(authIntentError==='EXISTING_ACCOUNT'){
   pendingSession=null;await supabase.auth.signOut({scope:'local'});sessionReady=false;currentUser=null;render();
   const message='Cette adresse Google possède déjà un compte AUREVIA. Utilisez « Se connecter avec Google ». ';
   const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;showStatus(message,true);return;
  }
  if(authIntentError==='ACCOUNT_NOT_REGISTERED'){
   try{await rejectAccountCreatedDuringLogin(session,authIntentError);pendingSession=null;return;}catch(rejectError){await forceLocalSignOut('Connexion refusée : cette adresse ne possède pas encore de compte AUREVIA. Utilisez « Créer un compte ». Si le refus n’a pas pu être appliqué, contactez le support.');return;}
  }
  if(!rememberAccount(session.user)){
   pendingSession=null;await supabase.auth.signOut({scope:'local'});sessionReady=false;currentUser=null;renderRememberedAccounts();render();
   const message='Deux comptes sont déjà mémorisés sur cet appareil. Retirez-en un avant de connecter un troisième compte.';const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;showStatus(message,true);return;
  }
  await sessionRequest(action,session.access_token);
  const licenseResponse=await fetch('/api/license',{headers:{authorization:`Bearer ${session.access_token}`},cache:'no-store'});
  const licenseState=await licenseResponse.json().catch(()=>({}));
  if(!licenseResponse.ok||licenseState.ok!==true)throw new Error(licenseState.error||'Impossible de vérifier la licence AUREVIA.');
  window.__aureviaLicense=licenseState;
  bindLocalDataOwner(session.user?.id);cacheAccountSession(session);sessionReady=true;pendingSession=null;render();
  window.dispatchEvent(new CustomEvent('aurevia:licensechange',{detail:licenseState}));
  const retry=$('retrySessionBtn');if(retry)retry.hidden=true;
  startHeartbeat();
 }catch(error){
  if(error.code==='SESSION_REPLACED'){
   await forceLocalSignOut('Une autre session est déjà active sur ce compte. Cette session a été déconnectée.');
  }else{
   pendingSession=session;
   showSessionRetry(`La session Google est valide, mais AUREVIA n’a pas pu confirmer l’accès (${error.status||'réseau'}). Votre connexion est conservée. Réessayez dans quelques instants. Détail : ${error.message}`);
  }
 }finally{sessionActivationBusy=false;}
}
export async function initAuth(){
 if(!$('authForm'))return;
 // Bind the visible auth controls BEFORE waiting for Supabase session restoration.
 // On slow mobile networks getSession() can take time or fail; the old ordering
 // left both buttons inert whenever initialization did not finish successfully.
 const startGoogleAuth=async(btn,mode,expectedEmail=null)=>{
  if(!btn)return;
  const remembered=getRememberedAccounts();const expected=String(expectedEmail||'').trim().toLowerCase();
  if(!expected&&remembered.length>=2){const message='La limite de deux comptes mémorisés est atteinte. Retirez un compte avant d’en ajouter un autre.';const status=$('authGateStatus')||$('authStatus');if(status)status.textContent=message;showStatus(message,true);return;}
  if(expected&&!remembered.some(x=>x.email===expected)){showStatus('Ce compte ne figure plus dans la mémoire de cet appareil.',true);renderRememberedAccounts();return;}
  btn.disabled=true;const oldLabel=btn.textContent;
  try{sessionStorage.setItem('aurevia_auth_intent',JSON.stringify({mode,startedAt:Date.now(),expectedEmail:expected||null}));}catch{}
  const status=$('authGateStatus')||$('authStatus');if(status)status.textContent=expected?`Reconnexion au compte ${expected} avec Google…`:mode==='signup'?'Ouverture de la création de compte Google…':'Ouverture de la connexion Google…';
  try{
   await ensureClient();
   const options={redirectTo:location.origin,queryParams:{prompt:'select_account'}};if(expected)options.queryParams.login_hint=expected;
   const {error}=await supabase.auth.signInWithOAuth({provider:'google',options});
   if(error)throw error;
  }catch(error){
   try{sessionStorage.removeItem('aurevia_auth_intent');}catch{}
   const message=(mode==='signup'?'Création du compte impossible : ':'Connexion impossible : ')+(error?.message||'service d’authentification indisponible.');
   if(status)status.textContent=message;showStatus(message,true);btn.disabled=false;btn.textContent=oldLabel;
  }
 };
 googleAuthStarter=startGoogleAuth;
 const bindGoogleAuth=(id,mode)=>{const button=$(id);if(!button||button.dataset.authBound==='1')return;button.dataset.authBound='1';button.addEventListener('click',event=>{event.preventDefault();startGoogleAuth(event.currentTarget,mode);});};
 bindGoogleAuth('googleLoginBtn','login');bindGoogleAuth('googleSignupBtn','signup');
 bindGoogleAuth('googleLoginGateBtn','login');bindGoogleAuth('googleSignupGateBtn','signup');
 renderRememberedAccounts();
 try{await ensureClient();}catch(error){const message='Service de compte indisponible : '+(error?.message||'chargement Supabase impossible.');showStatus(message,true);const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;return;}
 let sessionData=null;
 try{const result=await supabase.auth.getSession();if(result.error)throw result.error;sessionData=result.data;}
 catch(error){const message='Impossible de restaurer la session. Vous pouvez tout de même relancer la connexion : '+(error?.message||'erreur réseau.');showStatus(message,true);const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;render();}
 currentUser=sessionData?.session?.user||null;
 if(sessionData?.session){const sessionId=readJwtSessionId(sessionData.session.access_token);let known=false;try{known=Boolean(sessionId&&localStorage.getItem('aurevia_active_session_id')===sessionId);}catch{}await activateSession(sessionData.session,known?'heartbeat':'claim');window.dispatchEvent(new CustomEvent('aurevia:authchange',{detail:{event:'INITIAL_SESSION',userId:session.user.id}}));}else{render();renderRememberedAccounts();}
 supabase.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){stopHeartbeat();sessionReady=false;currentUser=null;currentProfile=null;window.__aureviaUserId=null;setAdminVisibility(false);render();renderRememberedAccounts();window.dispatchEvent(new CustomEvent('aurevia:authchange',{detail:{event,userId:null}}));return;}
  if(event==='SIGNED_IN'){currentUser=session?.user||null;sessionReady=false;adminVerified=false;window.__aureviaAdminVerified=null;document.querySelector('[data-page="admin"]')?.setAttribute('hidden','');$('page-admin')?.setAttribute('hidden','');activateSession(session,'claim').then(()=>window.dispatchEvent(new CustomEvent('aurevia:authchange',{detail:{event,userId:session?.user?.id||null}})));return;}
  if(event==='TOKEN_REFRESHED'&&session){currentUser=session.user||currentUser;cacheAccountSession(session);activateSession(session,'heartbeat');}
 });
 $('retrySessionBtn')?.addEventListener('click',async event=>{const btn=event.currentTarget;if(!pendingSession?.access_token){showStatus('Aucune session Google à vérifier. Relancez la connexion.',true);return;}btn.disabled=true;btn.textContent='Vérification…';try{await activateSession(pendingSession,'claim');}finally{btn.disabled=false;btn.textContent='Réessayer la vérification';}});
 $('signOutBtn')?.addEventListener('click',async()=>{if(!await confirmInApp({title:'Confirmer la déconnexion ?',message:'Vous allez fermer votre session AUREVIA sur cet appareil. Vos données enregistrées ne seront pas supprimées.',confirmLabel:'Me déconnecter'}))return;try{const {data}=await supabase.auth.getSession();if(data.session)cacheAccountSession(data.session);}catch{}try{await sessionRequest('end');}catch{}const {error}=await supabase.auth.signOut({scope:'local'});if(error){showStatus(error.message,true);showInAppNotice('Déconnexion impossible : '+error.message,{type:'error'});return;}try{localStorage.removeItem('aurevia_active_session_id');}catch{}currentUser=null;currentProfile=null;sessionReady=false;setAdminVisibility(false);render();renderRememberedAccounts();showStatus('Déconnexion effectuée. Vous pouvez revenir à un compte mémorisé sans repasser par Google tant que sa session reste valide sur cet appareil.');showInAppNotice('Déconnexion effectuée.',{type:'success'});});
 $('deleteOwnAccountBtn')?.addEventListener('click',async(event)=>{const btn=event.currentTarget;if(!currentUser||!sessionReady){showStatus('Connectez-vous pour supprimer votre compte.',true);return;}const email=currentUser.email||'ce compte';const deletedUserId=currentUser.id;const confirmed=await confirmInApp({title:'Supprimer le compte AUREVIA ?',message:`Compte : ${email}. Cette action est définitive et supprimera les données associées à AUREVIA. Votre compte Google ne sera pas supprimé. Pour confirmer, saisissez SUPPRIMER.`,phrase:'SUPPRIMER',confirmLabel:'Supprimer définitivement',danger:true});if(!confirmed)return;btn.disabled=true;btn.textContent='Suppression en cours…';try{const token=await getAnalysisAccessToken();if(!token)throw new Error('Session expirée. Reconnectez-vous puis réessayez.');const response=await fetch('/api/account-delete',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({confirmation:'SUPPRIMER'}),cache:'no-store'});const result=await response.json().catch(()=>({}));if(!response.ok||result.deleted!==true)throw new Error(result.error||'Le serveur n’a pas confirmé la suppression.');stopHeartbeat();sessionReady=false;pendingSession=null;currentUser=null;currentProfile=null;window.__aureviaUserId=null;setAdminVisibility(false);await supabase.auth.signOut({scope:'local'}).catch(()=>{});try{localStorage.removeItem('aurevia_active_session_id');localStorage.removeItem(LOCAL_DATA_OWNER_KEY);}catch{}clearLocalAccountData(deletedUserId);forgetAccountSession(String(email).toLowerCase());saveRememberedAccounts(getRememberedAccounts().filter(x=>x.email!==String(email).toLowerCase()));render();const status=$('authGateStatus');if(status)status.textContent='Votre compte AUREVIA et toutes ses anciennes données ont été supprimés. Pour revenir, choisissez « Créer un compte » ; Google ne restaurera pas l’ancien compte.';showStatus('Compte AUREVIA et données associées supprimés. Une nouvelle inscription sera nécessaire.');showInAppNotice('Compte AUREVIA et données associées supprimés.',{type:'success'});}catch(error){showStatus(error.message,true);showInAppNotice('Suppression du compte impossible : '+error.message,{type:'error'});btn.disabled=false;btn.textContent='Supprimer définitivement mon compte';}});
}

export async function createTelegramPairingCode(expectedUserId=null){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous avant de lier Telegram.');const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez la liaison.');
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);const code=Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle();if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez la liaison.');
 const preferences={...(data?.preferences||{}),telegram_pair_code:code,telegram_pair_expires_at:new Date(Date.now()+10*60*1000).toISOString()};
 const saved=await supabase.from('user_preferences').upsert({user_id:userId,preferences,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(saved.error)throw new Error(saved.error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé.');return code;
}
export async function loadAccountCurrency(expectedUserId=null){
 await ensureUser();if(!currentUser)return null;const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)return null;
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle();
 if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)return null;
 const value=String(data?.preferences?.account_currency||'').trim().toUpperCase();
 return /^[A-Z]{3}$/.test(value)?value:null;
}
export async function saveAccountCurrency(currency,expectedUserId=null){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous avant de définir la devise du compte.');const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez cette action.');
 const value=String(currency||'').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(value))throw new Error('Choisissez une devise valide.');
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle();if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez cette action.');
 const preferences={...(data?.preferences||{}),account_currency:value};
 const saved=await supabase.from('user_preferences').upsert({user_id:userId,preferences,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(saved.error)throw new Error(saved.error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé.');return value;
}
export async function loadRiskManagementSettings(expectedUserId=null){
 await ensureUser();if(!currentUser)return null;const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)return null;
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle();
 if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)return null;
 const saved=data?.preferences?.risk_management||{};
 const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
 return {
  brokerName:String(saved.brokerName||'').slice(0,80),
  accountType:['standard','raw_ecn','pro','demo','other'].includes(String(saved.accountType||'').toLowerCase())?String(saved.accountType).toLowerCase():'standard',
  balance:number(saved.balance),equity:number(saved.equity),marginUsed:number(saved.marginUsed),
  peakEquity:number(saved.peakEquity),dailyLossLimit:number(saved.dailyLossLimit),weeklyLossLimit:number(saved.weeklyLossLimit),
  defaultLeverage:number(saved.defaultLeverage,2000)
 };
}
export async function saveRiskManagementSettings(settings,expectedUserId=null){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous avant d’enregistrer la gestion du compte.');const userId=currentUser.id;
 if(expectedUserId&&userId!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez cette action.');
 const accountType=String(settings?.accountType||'standard').toLowerCase();
 if(!['standard','raw_ecn','pro','demo','other'].includes(accountType))throw new Error('Type de compte invalide.');
 const brokerName=String(settings?.brokerName||'').trim().slice(0,80);
 const number=(value,name,{min=0}={})=>{const n=Number(value);if(!Number.isFinite(n)||n<min)throw new Error('Valeur invalide : '+name);return n;};
 const clean={
  brokerName,accountType,
  balance:number(settings?.balance,'solde'),
  equity:number(settings?.equity,'equity'),
  marginUsed:number(settings?.marginUsed,'marge utilisée'),
  peakEquity:number(settings?.peakEquity,'pic d’equity'),
  dailyLossLimit:number(settings?.dailyLossLimit,'limite quotidienne'),
  weeklyLossLimit:number(settings?.weeklyLossLimit,'limite hebdomadaire'),
  defaultLeverage:number(settings?.defaultLeverage,'levier',{min:1})
 };
 clean.peakEquity=Math.max(clean.peakEquity,clean.equity);
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle();
 if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez cette action.');
 const preferences={...(data?.preferences||{}),risk_management:clean};
 const saved=await supabase.from('user_preferences').upsert({user_id:userId,preferences,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(saved.error)throw new Error(saved.error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé.');
 return clean;
}

export async function loadBrokerSettings(instrument,expectedUserId=null){
 await ensureUser();if(!currentUser)return null;const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)return null;
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle();
 if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)return null;
 const profiles=data?.preferences?.broker_specs||{};
 return profiles[instrument]||profiles.default||null;
}
export async function saveBrokerSettings(instrument,spec,expectedUserId=null){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous avant d’enregistrer les paramètres techniques.');const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez cette action.');
 const key=String(instrument||'').trim();if(!key)throw new Error('Choisissez un instrument.');
 const calculationType=String(spec?.calculationType||'').toLowerCase();
 if(!['contract','point','tick'].includes(calculationType))throw new Error('Choisissez une méthode de calcul.');
 const number=(value,name,{optional=false,zero=false}={})=>{if(optional&&(value===null||value===undefined||value===''))return null;const n=Number(value);if(!Number.isFinite(n)||(zero?n<0:n<=0))throw new Error('Valeur invalide : '+name);return n;};
 const clean={calculationType,leverage:number(spec.leverage,'levier',{optional:true}),minLot:number(spec.minLot,'lot minimum'),lotStep:number(spec.lotStep,'pas de volume'),maxLot:number(spec.maxLot,'lot maximum',{optional:true}),feesPerLot:number(spec.feesPerLot??0,'frais par lot',{zero:true})};
 if(clean.maxLot!==null&&clean.maxLot<clean.minLot)throw new Error('Le lot maximum doit être supérieur ou égal au lot minimum.');
 if(calculationType==='contract')clean.contractSize=number(spec.contractSize,'taille du contrat');
 if(calculationType==='point'){clean.pointSize=number(spec.pointSize,'taille du point');clean.pointValue=number(spec.pointValue,'valeur du point');}
 if(calculationType==='tick'){clean.tickSize=number(spec.tickSize,'taille du tick');clean.tickValue=number(spec.tickValue,'valeur du tick');}
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle();if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez cette action.');
 const preferences={...(data?.preferences||{}),broker_specs:{...(data?.preferences?.broker_specs||{}),[key]:clean}};
 const saved=await supabase.from('user_preferences').upsert({user_id:userId,preferences,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(saved.error)throw new Error(saved.error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé.');return clean;
}
export async function loadTelegramPreferences(expectedUserId=null){await ensureUser();if(!currentUser)return null;const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)return null;const {data,error}=await supabase.from('telegram_connections').select('chat_id,notify_all_analyses,notify_validated_signals,notify_economic_announcements,notify_product_announcements').eq('user_id',userId).maybeSingle();if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)return null;return data;}
export async function unlinkTelegramAccount(expectedUserId=null){
 await ensureUser();
 if(!currentUser)throw new Error('Connectez-vous avant de délier Telegram.');if(expectedUserId&&currentUser.id!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez la déliaison.');
 const token=await getAnalysisAccessToken();if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez la déliaison.');
 const response=await fetch('/api/telegram-unlink',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}',cache:'no-store'});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||result.ok!==true||result.unlinked!==true)throw new Error(result.error||'Le serveur n’a pas confirmé la déliaison Telegram.');
 return result;
}
export async function saveTelegramPreferences(prefs,expectedUserId=null){await ensureUser();if(!currentUser)throw new Error('Connectez-vous avant de modifier vos notifications.');const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)throw new Error('Le compte actif a changé. Recommencez cette action.');const {error}=await supabase.from('telegram_connections').update({notify_all_analyses:Boolean(prefs.all),notify_validated_signals:Boolean(prefs.signals),notify_economic_announcements:Boolean(prefs.economic),notify_product_announcements:Boolean(prefs.productAnnouncements),updated_at:new Date().toISOString()}).eq('user_id',userId);if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé.');}


export async function getAnalysisAccessToken(){
 await ensureClient();
 const {data,error}=await supabase.auth.getSession();
 if(error)throw new Error(error.message);
 return data.session?.access_token||null;
}

export async function getNotificationSession(){
 await ensureClient();
 const {data,error}=await supabase.auth.getSession();
 if(error)throw new Error(error.message);
 const session=data.session;
 return session?.access_token&&session.user?.id?{userId:session.user.id,accessToken:session.access_token}:null;
}
export async function sendTelegramNotification({type='analysis',text},expectedUserId=null){
 const session=await getNotificationSession();if(!session)return {sent:false,reason:'not_authenticated'};
 if(expectedUserId&&session.userId!==expectedUserId)return {sent:false,reason:'account_changed'};
 const response=await fetch('/api/telegram-notify',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.accessToken}`},body:JSON.stringify({type,text})});
 const result=await response.json().catch(()=>({error:'Réponse de notification illisible.'}));
 if(!response.ok)throw new Error(result.error||'Notification Telegram indisponible.');
 return result;
}

export async function restoreTradeGroupsFromSupabase(expectedUserId=null){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {restored:false,reason:'not_authenticated',groups:[]};if(expectedUserId&&user.id!==expectedUserId)return {restored:false,reason:'account_changed',groups:[],journal:[]};
 const [g,p,c,j]=await Promise.all([
  supabase.from('trading_position_groups').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
  supabase.from('trading_positions').select('*').eq('user_id',user.id).order('opened_at',{ascending:false}),
  supabase.from('trading_position_closes').select('*').eq('user_id',user.id).order('closed_at',{ascending:true}),
  supabase.from('trading_journal').select('id,group_id,position_id,instrument,direction,result,pnl,notes,mode,volume_initial,volume_remaining,tp_label,entry_price,actual_entry_price,stop_loss,take_profit,created_at,closed_at').eq('user_id',user.id).order('created_at',{ascending:false})
 ]);
 for(const result of [g,p,c,j])if(result.error)throw new Error(`Restauration cloud impossible : ${result.error.message}`);
 if(expectedUserId&&(user.id!==expectedUserId||(typeof window!=='undefined'&&String(window.__aureviaUserId||'')!==expectedUserId)))return {restored:false,reason:'account_changed',groups:[],journal:[]};
 const closesByPosition=new Map();for(const row of c.data||[]){const list=closesByPosition.get(row.position_id)||[];list.push({id:row.id,volume:Number(row.volume),exit:Number(row.exit_price),gross:Number(row.gross_pnl),fees:Number(row.fees),net:Number(row.net_pnl),...(row.fx_snapshot?{fxSnapshot:row.fx_snapshot}:{}),closedAt:row.closed_at});closesByPosition.set(row.position_id,list);}
 const positionsByGroup=new Map();for(const row of p.data||[]){const list=positionsByGroup.get(row.group_id)||[];list.push({id:row.id,groupId:row.group_id,instrument:(g.data||[]).find(x=>x.id===row.group_id)?.instrument,direction:(g.data||[]).find(x=>x.id===row.group_id)?.direction,tpLabel:row.tp_label,entry:Number(row.actual_entry_price??row.entry_price),actualEntryPrice:row.actual_entry_price===null||row.actual_entry_price===undefined?null:Number(row.actual_entry_price),stopLoss:Number(row.stop_loss),takeProfit:Number(row.take_profit),initialLot:Number(row.volume_initial),lot:Number(row.volume_initial),remainingLot:Number(row.volume_remaining),contractSize:row.contract_size===null?null:Number(row.contract_size),quoteToAccount:Number(row.quote_to_account||1),feesPerLot:Number(row.fees_per_lot||0),contractSpec:row.contract_spec||null,status:row.status,triggerSeen:Boolean(row.trigger_seen),activatedAt:row.activated_at||null,activationPrice:row.activation_price===null||row.activation_price===undefined?null:Number(row.activation_price),activationNotified:Boolean(row.activation_notified),realizedPnl:Number(row.net_pnl||0),fees:Number(row.fees||0),closes:closesByPosition.get(row.id)||[],createdAt:row.opened_at,closedAt:row.closed_at||null});positionsByGroup.set(row.group_id,list);}
 const groups=(g.data||[]).map(row=>{const children=positionsByGroup.get(row.id)||[];const first=(p.data||[]).find(x=>x.group_id===row.id);return {id:row.id,instrument:row.instrument,direction:row.direction,mode:row.mode,orderType:row.order_type,requestedLot:Number(row.requested_volume),lotStep:Number(row.lot_step||0.01),triggerPrice:first?.trigger_price===null||first?.trigger_price===undefined?null:Number(first.trigger_price),limitPrice:first?.limit_price===null||first?.limit_price===undefined?null:Number(first.limit_price),autoJournal:Boolean(row.auto_journal),contractSize:first?.contract_size===null||first?.contract_size===undefined?null:Number(first.contract_size),quoteToAccount:Number(first?.quote_to_account||1),feesPerLot:Number(first?.fees_per_lot||0),contractSpec:row.contract_spec||first?.contract_spec||null,brokerSnapshot:row.broker_snapshot||null,status:row.status,createdAt:row.created_at,actualEntryPrice:row.actual_entry_price===null||row.actual_entry_price===undefined?null:Number(row.actual_entry_price),children};});
 const journal=(j.data||[]).map(row=>({cloudId:row.id,id:row.id,groupId:row.group_id,childId:row.position_id||null,childIds:row.position_id?undefined:(row.mode==='separate'?[]:(positionsByGroup.get(row.group_id)||[]).map(x=>x.id)),mode:row.mode||'unique',instrument:row.instrument,direction:row.direction,tpLabel:row.tp_label,entry:row.actual_entry_price===null||row.actual_entry_price===undefined?(row.entry_price===null||row.entry_price===undefined?null:Number(row.entry_price)):Number(row.actual_entry_price),actualEntryPrice:row.actual_entry_price===null||row.actual_entry_price===undefined?null:Number(row.actual_entry_price),stopLoss:row.stop_loss===null||row.stop_loss===undefined?null:Number(row.stop_loss),takeProfit:row.take_profit===null||row.take_profit===undefined?null:Number(row.take_profit),lot:Number(row.volume_initial||0),realizedPnl:Number(row.pnl||0),status:resolveLinkedJournalStatus(row,groups.find(group=>group.id===row.group_id)),createdAt:row.created_at,closedAt:row.closed_at||null}));
 return {restored:true,groups,journal};
}

export async function syncTradeGroupToSupabase(group,expectedUserId=null){
 await ensureClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError)throw new Error(userError.message);
 if(!user)return {synced:false,reason:'not_authenticated'};
 if(expectedUserId&&user.id!==expectedUserId)return {synced:false,reason:'account_changed'};
 const {groupRow,positions,journalRows}=buildTradeGroupCloudRows(group,user.id);
 // The RPC derives user_id from auth.uid(), checks the active AUREVIA session,
 // and commits group, positions and linked journal rows in one transaction.
 const {data,error}=await supabase.rpc('aurevia_sync_trade_group',{
  p_group:groupRow,p_positions:positions,p_journal:journalRows
 });
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'La synchronisation atomique du trade n’a pas été confirmée.');
 return {synced:true,journalMappings:Array.isArray(data.journal_mappings)?data.journal_mappings:[]};
}

export async function syncActualFillPriceToSupabase(groupId,positionId,actualEntryPrice,expectedUserId=null){
 await ensureClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError)throw new Error(userError.message);
 if(!user)return {synced:false,reason:'not_authenticated'};
 if(expectedUserId&&user.id!==expectedUserId)return {synced:false,reason:'account_changed'};
 const {data,error}=await supabase.rpc('aurevia_update_actual_fill_price',{
  p_group_id:groupId,p_position_id:positionId||null,p_actual_entry_price:Number(actualEntryPrice)
 });
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'Le prix réel d’exécution n’a pas été synchronisé.');
 return {synced:true,actualEntryPrice:Number(data.actual_entry_price)};
}

export async function deleteLinkedJournalEntryFromSupabase(journalId,groupId=null,positionId=null){
 await ensureClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError)throw new Error(userError.message);
 if(!user)return {synced:false,reason:'not_authenticated'};
 const {data,error}=await supabase.rpc('aurevia_delete_linked_journal_entry',{
  p_journal_id:journalId||null,p_group_id:groupId,p_position_id:positionId
 });
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'La suppression de la fiche journal n’a pas été confirmée.');
 return {synced:true,deleted:Number(data.deleted||0)};
}

export async function deleteTradePositionFromSupabase(groupId,positionId){
 await ensureClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError)throw new Error(userError.message);
 if(!user)return {synced:false,reason:'not_authenticated'};
 const {data,error}=await supabase.rpc('aurevia_delete_closed_trade_position',{
  p_group_id:groupId,p_position_id:positionId
 });
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'Le retrait du trade clôturé n’a pas été confirmé.');
 return {synced:true,journalPreserved:Boolean(data.journal_preserved),groupDeleted:Boolean(data.group_deleted)};
}
export async function deleteOpenTradeGroupFromSupabase(groupId){
 await ensureClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError)throw new Error(userError.message);
 if(!user)return {synced:false,reason:'not_authenticated'};
 const {data,error}=await supabase.rpc('aurevia_delete_open_trade_group',{p_group_id:groupId});
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'Le retrait de la position ouverte n’a pas été confirmé.');
 return {synced:true,journalPreserved:Boolean(data.journal_preserved)};
}
export async function deletePendingTradeFromSupabase(groupId,positionId=null){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {synced:false,reason:'not_authenticated'};
 const {data,error}=await supabase.rpc('aurevia_delete_pending_trade',{
  p_group_id:groupId,p_position_id:positionId
 });
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'La suppression du trade en attente n’a pas été confirmée.');
 return {synced:true,journalDeleted:true,positionsDeleted:data.positions_deleted||0,groupDeleted:Boolean(data.group_deleted)};
}

export async function deleteClosedTradeGroupFromSupabase(groupId){
 await ensureClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError)throw new Error(userError.message);
 if(!user)return {synced:false,reason:'not_authenticated'};
 const {data,error}=await supabase.rpc('aurevia_delete_closed_trade_group',{p_group_id:groupId});
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'Le retrait de la position clôturée n’a pas été confirmé.');
 return {synced:true,journalPreserved:Boolean(data.journal_preserved)};
}
export async function syncTradeCloseToSupabase(group,child,closeEvent,expectedUserId=null){
 await ensureClient();
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError)throw new Error(userError.message);
 if(!user)return {synced:false,reason:'not_authenticated'};
 if(expectedUserId&&user.id!==expectedUserId)return {synced:false,reason:'account_changed'};
 // The close, FX conversion snapshot, remaining volume, cumulative P/L and
 // linked journal update are committed together by one PostgreSQL transaction.
 const {data,error}=await supabase.rpc('aurevia_record_position_close',{
  p_close_id:closeEvent.id,p_position_id:child.id,p_volume:closeEvent.volume,
  p_exit_price:closeEvent.exit,p_gross_pnl:closeEvent.gross,p_fees:closeEvent.fees,
  p_net_pnl:closeEvent.net,p_closed_at:closeEvent.closedAt,
  p_fx_snapshot:closeEvent.fxSnapshot??null
 });
 if(error)throw new Error(error.message);
 if(!data?.ok)throw new Error(data?.error||'La clôture cloud n’a pas été confirmée.');
 return {synced:true,...(data||{})};
}

export async function sendTelegramTest(expectedUserId=null){return sendTelegramNotification({type:'test',text:'✅ Test de réception AUREVIA COPILOT\n\nLa liaison Telegram fonctionne. Si vous voyez ce message, votre compte reçoit bien les notifications privées.'},expectedUserId);}

export async function loadPublishedAnnouncements(expectedUserId=null){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous pour consulter les annonces.');const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)return [];
 const now=new Date().toISOString();
 const {data:announcements,error}=await supabase.from('announcements').select('*').eq('is_published',true).or(`starts_at.is.null,starts_at.lte.${now}`).order('created_at',{ascending:false}).limit(200);
 if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)return [];
 const {data:reads,error:readError}=await supabase.from('announcement_reads').select('announcement_id,read_at').eq('user_id',userId);
 if(readError)throw new Error(readError.message);if(expectedUserId&&currentUser?.id!==expectedUserId)return [];
 const readMap=new Map((reads||[]).map(row=>[row.announcement_id,row.read_at]));
 return (announcements||[]).map(item=>({...item,read_at:readMap.get(item.id)||null,is_read:readMap.has(item.id)}));
}
export async function markAnnouncementAsRead(id,expectedUserId=null){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous pour marquer une annonce comme lue.');const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)throw new Error('Le compte actif a changé.');
 if(!id)throw new Error('Annonce invalide.');
 const {error}=await supabase.from('announcement_reads').upsert({user_id:userId,announcement_id:id},{onConflict:'user_id,announcement_id',ignoreDuplicates:true});
 if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé.');return {success:true};
}
export async function markAllAnnouncementsAsRead(ids,expectedUserId=null){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous pour marquer les annonces comme lues.');const userId=currentUser.id;if(expectedUserId&&userId!==expectedUserId)throw new Error('Le compte actif a changé.');
 const unique=[...new Set((ids||[]).filter(Boolean))];if(!unique.length)return {success:true,count:0};
 const rows=unique.map(announcement_id=>({user_id:userId,announcement_id}));
 const {error}=await supabase.from('announcement_reads').upsert(rows,{onConflict:'user_id,announcement_id',ignoreDuplicates:true});
 if(error)throw new Error(error.message);if(expectedUserId&&currentUser?.id!==expectedUserId)throw new Error('Le compte actif a changé.');return {success:true,count:unique.length};
}

export async function syncManualJournalToSupabase(entries=[],expectedUserId=null){
  await ensureClient();
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError)throw new Error(userError.message);
  if(!user)return {synced:false,entries:[]};
  if(expectedUserId&&user.id!==expectedUserId)return {synced:false,reason:'account_changed',entries:[]};
  const payload=(Array.isArray(entries)?entries:[]).map(row=>({
    id:row.id,instrument:row.instrument,direction:row.direction,result:row.result,date:row.date,note:row.note||''
  }));
  const {data,error}=await supabase.rpc('aurevia_sync_manual_journal',{p_entries:payload});
  if(error)throw new Error(error.message);
  if(!data?.ok)throw new Error(data?.error||'La synchronisation du journal manuel a échoué.');
  return {synced:true,entries:Array.isArray(data.entries)?data.entries:[]};
}
export async function deleteManualJournalFromSupabase(entryId){
  await ensureClient();
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError)throw new Error(userError.message);
  if(!user)return {synced:false};
  const {data,error}=await supabase.rpc('aurevia_delete_manual_journal_entry',{p_entry_id:entryId});
  if(error)throw new Error(error.message);
  if(!data?.ok)throw new Error(data?.error||'La suppression cloud du journal a échoué.');
  return {synced:true,deleted:Number(data.deleted||0)};
}
