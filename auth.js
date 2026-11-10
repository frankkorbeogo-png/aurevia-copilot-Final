const SUPABASE_URL='https://imkwbizyblzuevkodzqc.supabase.co';
// Publishable key: designed for browser use. Row access is still controlled by Supabase RLS.
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_DSlEiHcRGUKc5XjGeHz7jQ_n8EUMw6v';
let supabase=null;
async function ensureClient(){if(!supabase){const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.119.0');supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}return supabase;}
async function ensureUser(){await ensureClient();const {data,error}=await supabase.auth.getUser();if(error)throw new Error(error.message);currentUser=data.user||null;return currentUser;}
const $=id=>document.getElementById(id);
let currentUser=null,currentProfile=null;
function showStatus(message,isError=false){const el=$('authStatus');if(el){el.textContent=message;el.dataset.state=isError?'error':'ok';}}
async function refreshProfile(){await ensureClient();if(!currentUser){currentProfile=null;const link=document.querySelector('[data-page="admin"]');if(link)link.hidden=true;document.getElementById('adminUnlocked')?.setAttribute('hidden','');document.getElementById('adminLocked')?.removeAttribute('hidden');return;}const {data,error}=await supabase.from('profiles').select('display_name,role').eq('id',currentUser.id).maybeSingle();if(error){currentProfile=null;const link=document.querySelector('[data-page="admin"]');if(link)link.hidden=true;document.getElementById('adminUnlocked')?.setAttribute('hidden','');document.getElementById('adminLocked')?.removeAttribute('hidden');showStatus('Session active, mais profil non accessible selon les règles de sécurité.',true);return;}currentProfile=data;const adminLink=document.querySelector('[data-page="admin"]');const isAdmin=currentProfile?.role==='admin';if(adminLink)adminLink.hidden=false;document.getElementById('adminUnlocked')?.toggleAttribute('hidden',!isAdmin);document.getElementById('adminLocked')?.toggleAttribute('hidden',isAdmin);window.dispatchEvent(new CustomEvent('aurevia:adminchange',{detail:{isAdmin}}));const role=$('profileRole');if(role)role.textContent=currentProfile?.role==='admin'?'Administrateur':'Utilisateur';const name=$('profileName');if(name)name.textContent=currentProfile?.display_name||currentUser.email||'Compte connecté';const display=$('profileDisplayName');if(display&&document.activeElement!==display)display.value=currentProfile?.display_name||'';}
function render(){const logged=Boolean(currentUser);$('authSignedOut')?.toggleAttribute('hidden',logged);$('authSignedIn')?.toggleAttribute('hidden',!logged);const adminLink=document.querySelector('[data-page="admin"]');if(adminLink)adminLink.hidden=!logged;if(!logged){document.getElementById('adminUnlocked')?.setAttribute('hidden','');document.getElementById('adminLocked')?.removeAttribute('hidden');}if(logged)refreshProfile();}
export async function initAuth(){
 if(!$('authForm'))return;
 try{await ensureClient();}catch(error){showStatus('Service de compte indisponible : '+error.message,true);return;}
 const {data}=await supabase.auth.getSession();currentUser=data.session?.user||null;render();
 supabase.auth.onAuthStateChange((event,session)=>{currentUser=session?.user||null;render();if(event==='SIGNED_IN'||event==='SIGNED_OUT')window.dispatchEvent(new CustomEvent('aurevia:authchange',{detail:{event}}));});
 $('authForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('authEmail').value.trim(),password=$('authPassword').value;showStatus('Connexion en cours…');const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error){showStatus(error.message,true);return;}currentUser=data.user;render();showStatus('Connexion réussie.');});
 $('signUpBtn')?.addEventListener('click',async()=>{const email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||password.length<8){showStatus('Renseignez un e-mail et un mot de passe de 8 caractères minimum.',true);return;}showStatus('Création du compte…');const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});showStatus(error?.message||'Compte créé. Vérifiez votre e-mail si la confirmation est activée.',Boolean(error));});
 $('googleAuthBtn')?.addEventListener('click',async()=>{const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});if(error)showStatus(error.message,true);});
 $('signOutBtn')?.addEventListener('click',async()=>{const {error}=await supabase.auth.signOut({scope:'local'});if(error){showStatus(error.message,true);return;}currentUser=null;currentProfile=null;render();showStatus('Déconnexion effectuée.');});
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

export async function syncTradeGroupToSupabase(group){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {synced:false,reason:'not_authenticated'};
 const groupRow={id:group.id,user_id:user.id,mode:group.mode,instrument:group.instrument,direction:group.direction,order_type:group.orderType||'MARKET',requested_volume:group.requestedLot,auto_journal:group.autoJournal,status:group.status};
 const g=await supabase.from('trading_position_groups').upsert(groupRow,{onConflict:'id'});if(g.error)throw new Error(g.error.message);
 const positions=group.children.map(c=>({id:c.id,group_id:group.id,user_id:user.id,tp_label:c.tpLabel,entry_price:c.entry,stop_loss:c.stopLoss,take_profit:c.takeProfit,trigger_price:group.triggerPrice,limit_price:group.limitPrice,volume_initial:c.initialLot,volume_remaining:c.remainingLot,contract_size:group.contractSize,quote_to_account:group.quoteToAccount,fees_per_lot:group.feesPerLot,status:c.status,opened_at:c.createdAt}));
 const p=await supabase.from('trading_positions').upsert(positions,{onConflict:'id'});if(p.error)throw new Error(p.error.message);
 if(group.autoJournal){
  let journalRows=[];
  if(group.mode==='unique'){journalRows=[{user_id:user.id,instrument:group.instrument,direction:group.direction,result:'OPEN',pnl:0,notes:'Position unique AUREVIA · clôtures partielles liées',group_id:group.id,mode:'unique',volume_initial:group.requestedLot,volume_remaining:group.requestedLot,gross_pnl:0,fees:0,entry_price:group.children[0].entry,stop_loss:group.children[0].stopLoss}];}
  else journalRows=group.children.map(c=>({user_id:user.id,instrument:group.instrument,direction:group.direction,result:'OPEN',pnl:0,notes:`Trade séparé AUREVIA · ${c.tpLabel}`,group_id:group.id,position_id:c.id,mode:'separate',volume_initial:c.initialLot,volume_remaining:c.remainingLot,tp_label:c.tpLabel,gross_pnl:0,fees:0,entry_price:c.entry,stop_loss:c.stopLoss,take_profit:c.takeProfit}));
  const existing=await supabase.from('trading_journal').select('id,position_id').eq('user_id',user.id).eq('group_id',group.id);if(existing.error)throw new Error(existing.error.message);
  const existingRows=existing.data||[];
  const missing=journalRows.filter(row=>row.position_id? !existingRows.some(x=>x.position_id===row.position_id) : !existingRows.some(x=>!x.position_id));
  let created=[];if(missing.length){const j=await supabase.from('trading_journal').insert(missing).select('id,position_id');if(j.error)throw new Error(j.error.message);created=j.data||[];}
  for(const row of [...existingRows,...created]){const target=row.position_id||null;const q=target?supabase.from('trading_positions').update({journal_id:row.id}).eq('id',target):supabase.from('trading_positions').update({journal_id:row.id}).eq('group_id',group.id);const result=await q;if(result.error)throw new Error(result.error.message);}
 }
 return {synced:true};
}
export async function syncTradeCloseToSupabase(group,child,closeEvent){
 await ensureClient();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw new Error(userError.message);if(!user)return {synced:false,reason:'not_authenticated'};
 const close=await supabase.from('trading_position_closes').upsert({id:closeEvent.id,position_id:child.id,user_id:user.id,volume:closeEvent.volume,exit_price:closeEvent.exit,gross_pnl:closeEvent.gross,fees:closeEvent.fees,net_pnl:closeEvent.net,closed_at:closeEvent.closedAt},{onConflict:'id',ignoreDuplicates:true});if(close.error)throw new Error(close.error.message);
 const gross=child.closes.reduce((s,x)=>s+x.gross,0),fees=child.closes.reduce((s,x)=>s+x.fees,0);
 const pos=await supabase.from('trading_positions').update({volume_remaining:child.remainingLot,gross_pnl:gross,fees,net_pnl:child.realizedPnl,status:child.status,closed_at:child.closedAt||null,updated_at:new Date().toISOString()}).eq('id',child.id).eq('user_id',user.id);if(pos.error)throw new Error(pos.error.message);
 if(group.autoJournal){
  if(group.mode==='unique'){const totalGross=group.children.reduce((s,c)=>s+c.closes.reduce((a,x)=>a+x.gross,0),0),totalFees=group.children.reduce((s,c)=>s+c.fees,0),summary=groupSummary(group);const j=await supabase.from('trading_journal').update({pnl:summary.realized,gross_pnl:totalGross,fees:totalFees,volume_remaining:summary.remaining,result:summary.status==='CLOSED'?(summary.realized>0?'WIN':summary.realized<0?'LOSS':'BREAKEVEN'):'OPEN',closed_at:summary.status==='CLOSED'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('group_id',group.id).is('position_id',null);if(j.error)throw new Error(j.error.message);}
  else {const j=await supabase.from('trading_journal').update({pnl:child.realizedPnl,gross_pnl:gross,fees,volume_remaining:child.remainingLot,result:child.status==='CLOSED'?(child.realizedPnl>0?'WIN':child.realizedPnl<0?'LOSS':'BREAKEVEN'):'OPEN',closed_at:child.closedAt||null,updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('position_id',child.id);if(j.error)throw new Error(j.error.message);}
 }
 const summary=groupSummary(group);const g=await supabase.from('trading_position_groups').update({status:summary.status,updated_at:new Date().toISOString()}).eq('id',group.id).eq('user_id',user.id);if(g.error)throw new Error(g.error.message);return {synced:true};
}

export async function sendTelegramTest(){return sendTelegramNotification({type:'test',text:'✅ Test de réception AUREVIA COPILOT\n\nLa liaison Telegram fonctionne. Si vous voyez ce message, votre compte reçoit bien les notifications privées.'});}

export async function updateDisplayName(name){await ensureUser();if(!currentUser)throw new Error('Connectez-vous pour modifier votre profil.');const displayName=String(name||'').trim().slice(0,80);if(!displayName)throw new Error('Le nom affiché ne peut pas être vide.');const {error}=await supabase.from('profiles').update({display_name:displayName}).eq('id',currentUser.id);if(error)throw new Error(error.message);if(currentProfile)currentProfile.display_name=displayName;const label=document.getElementById('profileName');if(label)label.textContent=displayName;return displayName;}
