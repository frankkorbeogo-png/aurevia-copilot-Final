const SUPABASE_URL='https://imkwbizyblzuevkodzqc.supabase.co';
// Publishable key: designed for browser use. Row access is still controlled by Supabase RLS.
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_DSlEiHcRGUKc5XjGeHz7jQ_n8EUMw6v';
let supabase=null;
async function ensureClient(){if(!supabase){const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.119.0');supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}return supabase;}
async function ensureUser(){await ensureClient();const {data,error}=await supabase.auth.getUser();if(error)throw new Error(error.message);currentUser=data.user||null;return currentUser;}
const $=id=>document.getElementById(id);
let currentUser=null,currentProfile=null,adminVerified=false,sessionReady=false,heartbeatTimer=null,profileRefreshSequence=0;
window.__aureviaAuthenticated=false;document.body.classList.add('auth-required');
window.__aureviaAdminVerified=null;
function showStatus(message,isError=false){const el=$('authStatus');if(el){el.textContent=message;el.dataset.state=isError?'error':'ok';}}
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
 stopHeartbeat();sessionReady=false;setAdminVisibility(false);currentUser=null;currentProfile=null;
 try{await supabase?.auth.signOut({scope:'local'});}catch{}
 render();if(message)showStatus(message,true);
}
function startHeartbeat(){
 stopHeartbeat();heartbeatTimer=setInterval(async()=>{
  if(!currentUser||!sessionReady)return;
  try{await sessionRequest('heartbeat');}
  catch(error){await forceLocalSignOut(error.code==='SESSION_REPLACED'?'Votre compte a été connecté sur un autre appareil ou votre session a été révoquée. Vous avez été déconnecté.':'La protection de session est indisponible. Reconnectez-vous après vérification du service.');}
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
 const display=$('profileDisplayName');if(display&&document.activeElement!==display)display.value=currentProfile?.display_name||'';
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
 const createdAt=Date.parse(user?.created_at||'');
 if(!Number.isFinite(createdAt))return null;
 if(intent.mode==='signup'&&createdAt<intent.startedAt-5000)return 'EXISTING_ACCOUNT';
 if(intent.mode==='login'&&createdAt>=intent.startedAt-5000)return 'ACCOUNT_NOT_REGISTERED';
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
 try{
  const authIntentError=consumeAuthIntent(session.user);
  if(authIntentError==='EXISTING_ACCOUNT'){
   await supabase.auth.signOut({scope:'local'});sessionReady=false;currentUser=null;render();
   const message='Cette adresse Google possède déjà un compte AUREVIA. Utilisez « Se connecter avec Google ».';
   const gateStatus=$('authGateStatus');if(gateStatus)gateStatus.textContent=message;showStatus(message,true);return;
  }
  await sessionRequest(action,session.access_token);sessionReady=true;currentUser=session.user||currentUser;render();startHeartbeat();
 }catch(error){
  await forceLocalSignOut(error.code==='SESSION_REPLACED'?'Une autre session est déjà active sur ce compte. Cette session a été déconnectée.':'Mise à jour de sécurité requise : la protection des sessions n’est pas disponible. Le compte reste déconnecté jusqu’à son activation côté serveur.');
 }
}
export async function initAuth(){
 if(!$('authForm'))return;
 try{await ensureClient();}catch(error){showStatus('Service de compte indisponible : '+error.message,true);return;}
 const {data,error}=await supabase.auth.getSession();
 if(error){showStatus('Impossible de lire la session Google.',true);return;}
 currentUser=data.session?.user||null;
 if(data.session){const sessionId=readJwtSessionId(data.session.access_token);let known=false;try{known=Boolean(sessionId&&localStorage.getItem('aurevia_active_session_id')===sessionId);}catch{}await activateSession(data.session,known?'heartbeat':'claim');window.dispatchEvent(new CustomEvent('aurevia:authchange',{detail:{event:'INITIAL_SESSION'}}));}else render();
 supabase.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){stopHeartbeat();sessionReady=false;currentUser=null;currentProfile=null;setAdminVisibility(false);render();window.dispatchEvent(new CustomEvent('aurevia:authchange',{detail:{event}}));return;}
  if(event==='SIGNED_IN'){currentUser=session?.user||null;sessionReady=false;adminVerified=false;window.__aureviaAdminVerified=null;document.querySelector('[data-page=\"admin\"]')?.setAttribute('hidden','');$('page-admin')?.setAttribute('hidden','');activateSession(session,'claim').then(()=>window.dispatchEvent(new CustomEvent('aurevia:authchange',{detail:{event}})));return;}
  if(event==='TOKEN_REFRESHED'&&session){currentUser=session.user||currentUser;activateSession(session,'heartbeat');}
 });
 const startGoogleAuth=async(btn,mode)=>{btn.disabled=true;try{sessionStorage.setItem('aurevia_auth_intent',JSON.stringify({mode,startedAt:Date.now()}));}catch{}const status=$('authGateStatus')||$('authStatus');if(status)status.textContent=mode==='signup'?'Vérification de votre inscription avec Google…':'Redirection sécurisée vers Google…';const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin,queryParams:{prompt:'select_account'}}});if(error){try{sessionStorage.removeItem('aurevia_auth_intent');}catch{}if(status)status.textContent=(mode==='signup'?'Inscription':'Connexion')+' Google impossible : '+error.message;btn.disabled=false;}};
 const bindGoogleAuth=(id,mode)=>$(id)?.addEventListener('click',e=>startGoogleAuth(e.currentTarget,mode));
 bindGoogleAuth('googleLoginBtn','login');bindGoogleAuth('googleSignupBtn','signup');
 bindGoogleAuth('googleLoginGateBtn','login');bindGoogleAuth('googleSignupGateBtn','signup');
 $('signOutBtn')?.addEventListener('click',async()=>{try{await sessionRequest('end');}catch{}const {error}=await supabase.auth.signOut({scope:'local'});if(error){showStatus(error.message,true);return;}try{localStorage.removeItem('aurevia_active_session_id');}catch{}currentUser=null;currentProfile=null;sessionReady=false;setAdminVisibility(false);render();showStatus('Déconnexion effectuée.');});
 $('deleteOwnAccountBtn')?.addEventListener('click',async(event)=>{const btn=event.currentTarget;if(!currentUser||!sessionReady){showStatus('Connectez-vous pour supprimer votre compte.',true);return;}const email=currentUser.email||'ce compte';const first=window.confirm(`Supprimer définitivement votre compte AUREVIA (${email}) ?\n\nToutes les données associées seront supprimées selon les règles de conservation. Cette action est irréversible. Votre compte Google ne sera pas supprimé.`);if(!first)return;const confirmation=window.prompt('Pour confirmer, saisissez SUPPRIMER :');if(confirmation!=='SUPPRIMER'){showStatus('Suppression annulée : confirmation incorrecte.',true);return;}btn.disabled=true;btn.textContent='Suppression en cours…';try{const token=await getAnalysisAccessToken();const response=await fetch('/api/account-delete',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({confirmation:'SUPPRIMER'}),cache:'no-store'});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Suppression impossible.');stopHeartbeat();sessionReady=false;currentUser=null;currentProfile=null;setAdminVisibility(false);await supabase.auth.signOut({scope:'local'});render();const status=$('authGateStatus');if(status)status.textContent='Votre compte AUREVIA a été supprimé. Vous pouvez fermer cette page.';showStatus('Compte AUREVIA supprimé.');}catch(error){showStatus(error.message,true);btn.disabled=false;btn.textContent='Supprimer définitivement mon compte';}});
}

export async function createTelegramPairingCode(){
 await ensureUser();if(!currentUser)throw new Error('Connectez-vous avant de lier Telegram.');
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);const code=Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');
 const {data,error}=await supabase.from('user_preferences').select('preferences').eq('user_id',currentUser.id).maybeSingle();if(error)throw new Error(error.message);
 const preferences={...(data?.preferences||{}),telegram_pair_code:code,telegram_pair_expires_at:new Date(Date.now()+10*60*1000).toISOString()};
 const saved=await supabase.from('user_preferences').upsert({user_id:currentUser.id,preferences,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(saved.error)throw new Error(saved.error.message);return code;
}
export async function loadTelegramPreferences(){await ensureUser();if(!currentUser)return null;const {data,error}=await supabase.from('telegram_connections').select('chat_id,notify_all_analyses,notify_validated_signals,notify_economic_announcements').eq('user_id',currentUser.id).maybeSingle();if(error)throw new Error(error.message);return data;}
export async function saveTelegramPreferences(prefs){await ensureUser();if(!currentUser)throw new Error('Connectez-vous avant de modifier vos notifications.');const {error}=await supabase.from('telegram_connections').update({notify_all_analyses:Boolean(prefs.all),notify_validated_signals:Boolean(prefs.signals),notify_economic_announcements:Boolean(prefs.economic),updated_at:new Date().toISOString()}).eq('user_id',currentUser.id);if(error)throw new Error(error.message);}


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
export async function sendTelegramNotification({type='analysis',text}){
 const session=await getNotificationSession();if(!session)return {sent:false,reason:'not_authenticated'};
 const response=await fetch('/api/telegram-notify',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.accessToken}`},body:JSON.stringify({type,text})});
 const result=await response.json().catch(()=>({error:'Réponse de notification illisible.'}));
 if(!response.ok)throw new Error(result.error||'Notification Telegram indisponible.');
 return result;
}

export async function restoreTradeGroupsFromSupabase(){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {restored:false,reason:'not_authenticated',groups:[]};
 const [g,p,c,j]=await Promise.all([
  supabase.from('trading_position_groups').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
  supabase.from('trading_positions').select('*').eq('user_id',user.id).order('opened_at',{ascending:false}),
  supabase.from('trading_position_closes').select('*').eq('user_id',user.id).order('closed_at',{ascending:true}),
  supabase.from('trading_journal').select('id,group_id,position_id,instrument,direction,result,pnl,notes,mode,volume_initial,volume_remaining,tp_label,entry_price,stop_loss,take_profit,created_at,closed_at').eq('user_id',user.id).not('group_id','is',null).order('created_at',{ascending:false})
 ]);
 for(const result of [g,p,c,j])if(result.error)throw new Error(`Restauration cloud impossible : ${result.error.message}`);
 const closesByPosition=new Map();for(const row of c.data||[]){const list=closesByPosition.get(row.position_id)||[];list.push({id:row.id,volume:Number(row.volume),exit:Number(row.exit_price),gross:Number(row.gross_pnl),fees:Number(row.fees),net:Number(row.net_pnl),closedAt:row.closed_at});closesByPosition.set(row.position_id,list);}
 const positionsByGroup=new Map();for(const row of p.data||[]){const list=positionsByGroup.get(row.group_id)||[];list.push({id:row.id,groupId:row.group_id,instrument:(g.data||[]).find(x=>x.id===row.group_id)?.instrument,direction:(g.data||[]).find(x=>x.id===row.group_id)?.direction,tpLabel:row.tp_label,entry:Number(row.entry_price),stopLoss:Number(row.stop_loss),takeProfit:Number(row.take_profit),initialLot:Number(row.volume_initial),lot:Number(row.volume_initial),remainingLot:Number(row.volume_remaining),contractSize:row.contract_size===null?null:Number(row.contract_size),quoteToAccount:Number(row.quote_to_account||1),feesPerLot:Number(row.fees_per_lot||0),status:row.status,realizedPnl:Number(row.net_pnl||0),fees:Number(row.fees||0),closes:closesByPosition.get(row.id)||[],createdAt:row.opened_at,closedAt:row.closed_at||null});positionsByGroup.set(row.group_id,list);}
 const groups=(g.data||[]).map(row=>{const children=positionsByGroup.get(row.id)||[];const first=(p.data||[]).find(x=>x.group_id===row.id);return {id:row.id,instrument:row.instrument,direction:row.direction,mode:row.mode,orderType:row.order_type,requestedLot:Number(row.requested_volume),lotStep:Number(row.lot_step||0.01),triggerPrice:first?.trigger_price===null||first?.trigger_price===undefined?null:Number(first.trigger_price),limitPrice:first?.limit_price===null||first?.limit_price===undefined?null:Number(first.limit_price),autoJournal:Boolean(row.auto_journal),contractSize:first?.contract_size===null||first?.contract_size===undefined?null:Number(first.contract_size),quoteToAccount:Number(first?.quote_to_account||1),feesPerLot:Number(first?.fees_per_lot||0),status:row.status,createdAt:row.created_at,children};});
 const journal=(j.data||[]).map(row=>({cloudId:row.id,id:row.id,groupId:row.group_id,childId:row.position_id||null,childIds:row.position_id?undefined:(positionsByGroup.get(row.group_id)||[]).map(x=>x.id),mode:row.mode||'unique',instrument:row.instrument,direction:row.direction,tpLabel:row.tp_label,entry:row.entry_price===null||row.entry_price===undefined?null:Number(row.entry_price),stopLoss:row.stop_loss===null||row.stop_loss===undefined?null:Number(row.stop_loss),takeProfit:row.take_profit===null||row.take_profit===undefined?null:Number(row.take_profit),lot:Number(row.volume_initial||0),realizedPnl:Number(row.pnl||0),status:row.result==='OPEN'?'OPEN':'CLOSED',createdAt:row.created_at,closedAt:row.closed_at||null}));
 return {restored:true,groups,journal};
}

export async function syncTradeGroupToSupabase(group){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {synced:false,reason:'not_authenticated'};
 const groupRow={id:group.id,user_id:user.id,mode:group.mode,instrument:group.instrument,direction:group.direction,order_type:group.orderType||'MARKET',requested_volume:group.requestedLot,lot_step:group.lotStep||0.01,auto_journal:group.autoJournal,status:group.status};
 const g=await supabase.from('trading_position_groups').upsert(groupRow,{onConflict:'id'});if(g.error)throw new Error(g.error.message);
 const positions=group.children.map(c=>({id:c.id,group_id:group.id,user_id:user.id,tp_label:c.tpLabel,entry_price:c.entry,stop_loss:c.stopLoss,take_profit:c.takeProfit,trigger_price:group.triggerPrice,limit_price:group.limitPrice,volume_initial:c.initialLot,volume_remaining:c.remainingLot,contract_size:group.contractSize,quote_to_account:group.quoteToAccount,fees_per_lot:group.feesPerLot,status:c.status,opened_at:c.createdAt}));
 const p=await supabase.from('trading_positions').upsert(positions,{onConflict:'id'});if(p.error)throw new Error(p.error.message);
 if(group.autoJournal){
  let journalRows=[];
  if(group.mode==='unique'){journalRows=[{user_id:user.id,instrument:group.instrument,direction:group.direction,result:'OPEN',pnl:0,notes:'Position unique AUREVIA · clôtures partielles liées',group_id:group.id,mode:'unique',volume_initial:group.requestedLot,volume_remaining:group.requestedLot,gross_pnl:0,fees:0,entry_price:group.children[0].entry,stop_loss:group.children[0].stopLoss,take_profit:group.children[0].takeProfit}];}
  else journalRows=group.children.map(c=>({user_id:user.id,instrument:group.instrument,direction:group.direction,result:'OPEN',pnl:0,notes:`Trade séparé AUREVIA · ${c.tpLabel}`,group_id:group.id,position_id:c.id,mode:'separate',volume_initial:c.initialLot,volume_remaining:c.remainingLot,tp_label:c.tpLabel,gross_pnl:0,fees:0,entry_price:c.entry,stop_loss:c.stopLoss,take_profit:c.takeProfit}));
  const existing=await supabase.from('trading_journal').select('id,position_id').eq('user_id',user.id).eq('group_id',group.id);if(existing.error)throw new Error(existing.error.message);
  const existingRows=existing.data||[];
  const missing=journalRows.filter(row=>row.position_id? !existingRows.some(x=>x.position_id===row.position_id) : !existingRows.some(x=>!x.position_id));
  let created=[];if(missing.length){const j=await supabase.from('trading_journal').insert(missing).select('id,position_id');if(j.error)throw new Error(j.error.message);created=j.data||[];}
  for(const row of [...existingRows,...created]){const target=row.position_id||null;const q=target?supabase.from('trading_positions').update({journal_id:row.id}).eq('id',target):supabase.from('trading_positions').update({journal_id:row.id}).eq('group_id',group.id);const result=await q;if(result.error)throw new Error(result.error.message);const child=target?group.children.find(c=>c.id===target):group.children[0];if(child){const journalUpdate=target?{entry_price:child.entry,stop_loss:child.stopLoss,take_profit:child.takeProfit,volume_initial:child.initialLot,volume_remaining:child.remainingLot}:{entry_price:child.entry,stop_loss:child.stopLoss,take_profit:child.takeProfit,volume_initial:group.requestedLot,volume_remaining:groupSummary(group).remaining};const updatedJournal=await supabase.from('trading_journal').update(journalUpdate).eq('id',row.id).eq('user_id',user.id);if(updatedJournal.error)throw new Error(updatedJournal.error.message);}}
 }
 return {synced:true};
}
export async function deleteClosedTradeGroupFromSupabase(groupId){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {synced:false,reason:'not_authenticated'};
 const {data:group,error:groupError}=await supabase.from('trading_position_groups').select('id,status').eq('id',groupId).eq('user_id',user.id).maybeSingle();if(groupError)throw new Error(groupError.message);if(!group)return {synced:false,reason:'not_found'};if(group.status!=='CLOSED')throw new Error('Un groupe encore ouvert ne peut pas être supprimé.');
 const journal=await supabase.from('trading_journal').delete().eq('user_id',user.id).eq('group_id',groupId);if(journal.error)throw new Error(journal.error.message);
 const removed=await supabase.from('trading_position_groups').delete().eq('id',groupId).eq('user_id',user.id).eq('status','CLOSED');if(removed.error)throw new Error(removed.error.message);return {synced:true};
}

export async function syncTradeCloseToSupabase(group,child,closeEvent){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {synced:false,reason:'not_authenticated'};
 // One server transaction inserts the idempotent close event, recomputes totals,
 // and updates the linked journal/group. A retry cannot double-count the close.
 const {data,error}=await supabase.rpc('aurevia_record_position_close',{
  p_close_id:closeEvent.id,p_position_id:child.id,p_volume:closeEvent.volume,
  p_exit_price:closeEvent.exit,p_gross_pnl:closeEvent.gross,p_fees:closeEvent.fees,
  p_net_pnl:closeEvent.net,p_closed_at:closeEvent.closedAt
 });
 if(error)throw new Error(error.message);
 return {synced:true,...(data||{})};
}

export async function sendTelegramTest(){return sendTelegramNotification({type:'test',text:'✅ Test de réception AUREVIA COPILOT\n\nLa liaison Telegram fonctionne. Si vous voyez ce message, votre compte reçoit bien les notifications privées.'});}

export async function updateDisplayName(name){await ensureUser();if(!currentUser)throw new Error('Connectez-vous pour modifier votre profil.');const displayName=String(name||'').trim().slice(0,80);if(!displayName)throw new Error('Le nom affiché ne peut pas être vide.');const {error}=await supabase.from('profiles').update({display_name:displayName}).eq('id',currentUser.id);if(error)throw new Error(error.message);if(currentProfile)currentProfile.display_name=displayName;const label=document.getElementById('profileName');if(label)label.textContent=displayName;return displayName;}
