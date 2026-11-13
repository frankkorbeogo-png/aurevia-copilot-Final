import {verifyBearerUser,assertActiveSession,rpc,json} from './_session-auth.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const env=n=>(process.env[n]||'').trim();
async function request(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(new Error(data?.message||data?.msg||data?.error_description||data?.error||`Service Supabase indisponible (${response.status}).`),{statusCode:response.status});
 return data;
}
const adminHeaders=(key,extra={})=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...extra});
async function audit(base,key,actor,action,target=null,details={}){
 await rpc(base,key,'aurevia_admin_audit',{p_actor_id:actor,p_action:action,p_target_user_id:target,p_details:details});
}

async function broadcastProductAnnouncement(base,key,announcement,recipientIds=null){
 const token=env('TELEGRAM_BOT_TOKEN');
 if(!token)return {status:'not_configured',sent:0,failed:0,skipped:0};
 const id=announcement?.id;if(!id)return {status:'not_sent',sent:0,failed:0,skipped:0};
 // Atomic claim: only the first publish transition may start a broadcast.
 const claim=await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}&telegram_broadcast_started_at=is.null&select=id`,{method:'PATCH',headers:adminHeaders(key,{'Prefer':'return=representation'}),body:JSON.stringify({telegram_broadcast_started_at:new Date().toISOString()})});
 if(!Array.isArray(claim)||!claim.length)return {status:'already_processed',sent:0,failed:0,skipped:0};
 const recipientFilter=Array.isArray(recipientIds)&&recipientIds.length?`&user_id=in.(${recipientIds.map(encodeURIComponent).join(',')})`:'';
 const recipients=await request(`${base}/rest/v1/telegram_connections?select=user_id,chat_id&notify_product_announcements=eq.true&chat_id=not.is.null${recipientFilter}&limit=5000`,{headers:adminHeaders(key)});
 // Administrators are valid recipients too when they opted in to product announcements.
 const eligible=[];
 for(const row of (Array.isArray(recipients)?recipients:[])){
  const userId=String(row.user_id||'').trim(),chatId=String(row.chat_id||'').trim();
  if(!userId||!chatId)continue;
  eligible.push(chatId);
 }
 const unique=[...new Set(eligible)];
 const skipped= Math.max(0,(Array.isArray(recipients)?recipients.length:0)-eligible.length);
 const esc=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const safeUrl=(()=>{try{const u=new URL(String(announcement.source_url||''));return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}})();
 const message=`<b>📢 AUREVIA COPILOT · NOUVELLE ANNONCE</b>\n\n<b>${esc(announcement.title)}</b>\n\n${esc(announcement.body)}${safeUrl?`\n\n<a href="${esc(safeUrl)}">En savoir plus</a>`:''}`;
 let sent=0,failed=0;const errors=[];
 for(const chatId of unique){
  try{const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text:message,parse_mode:'HTML',disable_web_page_preview:true}),signal:AbortSignal.timeout(9000)});const result=await response.json().catch(()=>null);if(!response.ok||!result?.ok)throw new Error(result?.description||`Telegram HTTP ${response.status}`);sent++;}
  catch(error){failed++;if(errors.length<5)errors.push(String(error.message||error).slice(0,180));}
  // Stay below Telegram's ordinary per-chat broadcast throughput.
  await new Promise(resolve=>setTimeout(resolve,35));
 }
 const result={status:failed?(sent?'partial':'failed'):'sent',sent,failed,skipped,errors};
 await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:adminHeaders(key),body:JSON.stringify({telegram_broadcast_completed_at:new Date().toISOString(),telegram_broadcast_result:result})});
 return result;
}
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}};
 if(!['GET','POST'].includes(event.httpMethod))return json(405,{error:'Méthode non autorisée.'});
 try{
  const context=await verifyBearerUser(event);
  await assertActiveSession(context);
  const {base,service:key,user:caller}=context;
  let body={};
  if(event.httpMethod==='POST'){try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}}
  const isAdmin=await rpc(base,key,'aurevia_is_admin',{p_user_id:caller.id});
  if(isAdmin!==true)return json(403,{error:'Accès administrateur refusé.'});
  if(event.httpMethod==='GET'&&event.queryStringParameters?.verify==='1')return json(200,{ok:true,isAdmin:true,user:{id:caller.id,email:caller.email}});
  if(event.httpMethod==='GET'){
   const page=Math.max(1,Math.min(1000,Number.parseInt(event.queryStringParameters?.page||'1',10)||1));
   const search=String(event.queryStringParameters?.q||'').trim().slice(0,120);
   const [listing,stats,announcements,auditLog]=await Promise.all([
    rpc(base,key,'aurevia_admin_user_list',{p_actor_id:caller.id,p_search:search,p_limit:100,p_offset:(page-1)*100}),
    rpc(base,key,'aurevia_admin_stats',{p_actor_id:caller.id}),
    request(`${base}/rest/v1/announcements?select=id,title,body,category,is_published,starts_at,ends_at,created_at&order=created_at.desc&limit=100`,{headers:adminHeaders(key)}),
    rpc(base,key,'aurevia_admin_audit_list',{p_actor_id:caller.id})
   ]);
   return json(200,{ok:true,users:Array.isArray(listing?.users)?listing.users:[],stats:stats||{},announcements:Array.isArray(announcements)?announcements:[],auditLog:Array.isArray(auditLog)?auditLog:[],pagination:{page,per_page:100,total:Number(listing?.total)||0,returned:Array.isArray(listing?.users)?listing.users.length:0,has_more:Boolean(listing?.has_more)}});
  }
  const action=String(body.action||'');
  if(action==='telegram_bot_check'){
   const token=env('TELEGRAM_BOT_TOKEN'),secret=env('TELEGRAM_WEBHOOK_SECRET');
   if(!token)return json(200,{ok:false,valid:false,status:'not_configured',message:'TELEGRAM_BOT_TOKEN absent côté serveur.'});
   try{
    const api=`https://api.telegram.org/bot${token}`;
    const response=await fetch(`${api}/getMe`,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
    const result=await response.json().catch(()=>null);
    if(!(response.ok&&result?.ok&&result?.result?.is_bot===true)){
     if(response.status===401||result?.error_code===401)return json(200,{ok:true,valid:false,status:'invalid',message:'Telegram refuse le token (non valide ou révoqué).'});
     return json(200,{ok:false,valid:false,status:'telegram_error',message:'Telegram n’a pas pu confirmer le bot. Réessayez plus tard.'});
    }
    const bot=result.result;
    if(!secret||!/^[A-Za-z0-9_-]{1,256}$/.test(secret))return json(200,{ok:true,valid:true,status:'valid_webhook_not_configured',bot:{id:bot.id,first_name:String(bot.first_name||'').slice(0,64),username:String(bot.username||'').slice(0,64)},webhook:{configured:false},message:'Token valide, mais TELEGRAM_WEBHOOK_SECRET est absent ou invalide. Ajoutez un secret de 1 à 256 caractères (A-Z, a-z, 0-9, _ ou -), puis relancez le contrôle.'});
    const webhookUrl='https://aurevia-copilot-ia.netlify.app/.netlify/functions/telegram-webhook';
    const setResponse=await fetch(`${api}/setWebhook`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({url:webhookUrl,secret_token:secret,allowed_updates:['message'],drop_pending_updates:false}),signal:AbortSignal.timeout(12000)});
    const setResult=await setResponse.json().catch(()=>null);
    if(!setResponse.ok||!setResult?.ok||setResult?.result!==true)return json(200,{ok:true,valid:true,status:'webhook_setup_failed',bot:{id:bot.id,first_name:String(bot.first_name||'').slice(0,64),username:String(bot.username||'').slice(0,64)},webhook:{configured:false},message:'Token valide, mais Telegram a refusé la configuration du webhook. Vérifiez le secret et réessayez.'});
    const infoResponse=await fetch(`${api}/getWebhookInfo`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
    const infoPayload=await infoResponse.json().catch(()=>null),info=infoPayload?.result||{};
    const configured=Boolean(infoPayload?.ok&&info.url===webhookUrl);
    return json(200,{ok:true,valid:true,status:configured?'valid_webhook_ready':'webhook_verification_failed',bot:{id:bot.id,first_name:String(bot.first_name||'').slice(0,64),username:String(bot.username||'').slice(0,64)},webhook:{configured,url_matches:configured,pending_updates:Number(info.pending_update_count)||0,last_error:info.last_error_message?String(info.last_error_message).slice(0,240):null},message:configured?'Token valide et webhook Telegram configuré. Envoyez maintenant /start CODE au bot.':'Le webhook a été demandé, mais sa présence n’a pas pu être confirmée.'});
   }catch{
    return json(200,{ok:false,valid:false,status:'unreachable',message:'Impossible de joindre Telegram pour le moment.'});
   }
  }
  const target=String(body.user_id||'');
  if(['suspend','activate','delete_user','revoke_session'].includes(action)&&!UUID.test(target))return json(400,{error:'Identifiant utilisateur invalide.'});
  if(['suspend','activate','delete_user','revoke_session'].includes(action)&&target===caller.id)return json(409,{error:'Cette action ne peut pas viser votre propre compte depuis la console.'});
  if(['suspend','activate','delete_user'].includes(action)){
   const targetIsAdmin=await rpc(base,key,'aurevia_is_admin',{p_user_id:target});
   if(targetIsAdmin===true)return json(409,{error:'Un compte administrateur ne peut pas être suspendu ou supprimé depuis la console utilisateurs.'});
  }
  if(action==='suspend'||action==='activate'){
   const ban_duration=action==='suspend'?'876000h':'none';
   await request(`${base}/auth/v1/admin/users/${encodeURIComponent(target)}`,{method:'PUT',headers:adminHeaders(key),body:JSON.stringify({ban_duration})});
   if(action==='suspend')await rpc(base,key,'aurevia_admin_revoke_session',{p_actor_id:caller.id,p_target_user_id:target});
   await audit(base,key,caller.id,action,target,{source:'admin_console'});
   return json(200,{ok:true,action});
  }
  if(action==='revoke_session'){
   const revoked=await rpc(base,key,'aurevia_admin_revoke_session',{p_actor_id:caller.id,p_target_user_id:target});
   return json(200,{ok:true,revoked:Boolean(revoked)});
  }
  if(action==='delete_user'){
   // Revoke the AUREVIA session before deleting the Auth identity. This immediately
   // invalidates the app session; protected APIs also revalidate the Google user.
   await rpc(base,key,'aurevia_admin_revoke_session',{p_actor_id:caller.id,p_target_user_id:target});
   await request(`${base}/auth/v1/admin/users/${encodeURIComponent(target)}`,{method:'DELETE',headers:adminHeaders(key)});
   await audit(base,key,caller.id,'delete_user',target,{source:'admin_console',session_revoked:true});
   return json(200,{ok:true,deleted:true,session_revoked:true});
  }
  if(action==='announcement_create'){
   const title=String(body.title||'').trim().slice(0,120),content=String(body.body||'').trim().slice(0,4000),category=String(body.category||'general').trim().slice(0,40);
   if(!title||!content)return json(400,{error:'Titre et contenu obligatoires.'});
   const startsAt=body.starts_at?new Date(body.starts_at):new Date();
   const endsAt=body.ends_at?new Date(body.ends_at):null;
   if(!Number.isFinite(startsAt.getTime())||(endsAt&&!Number.isFinite(endsAt.getTime()))||(endsAt&&endsAt<=startsAt))return json(400,{error:'Dates de publication invalides : l’expiration doit être postérieure au début.'});
   const audience=body.audience==='selected'?'selected':'all';
   const recipientIds=[...new Set((Array.isArray(body.recipient_ids)?body.recipient_ids:[]).map(v=>String(v||'')).filter(v=>UUID.test(v)))];
   if(audience==='selected'&&(!recipientIds.length||recipientIds.length>100))return json(400,{error:'Une annonce ciblée doit comporter entre 1 et 100 destinataires.'});
   if(audience==='all'&&recipientIds.length)return json(400,{error:'Destinataires inattendus pour une annonce générale.'});
   if(audience==='selected'){
    const existing=await request(`${base}/rest/v1/profiles?select=id&id=in.(${recipientIds.map(encodeURIComponent).join(',')})`,{headers:adminHeaders(key)});
    const validIds=new Set((Array.isArray(existing)?existing:[]).map(row=>row.id));
    if(recipientIds.some(id=>!validIds.has(id)))return json(400,{error:'Un ou plusieurs destinataires ne correspondent pas à un compte utilisateur valide.'});
   }
   // Create as draft, attach the audience, then publish: recipients never see a partially configured targeted announcement.
   const created=await request(`${base}/rest/v1/announcements`,{method:'POST',headers:adminHeaders(key,{'Prefer':'return=representation'}),body:JSON.stringify({title,body:content,category,source_url:body.source_url||null,starts_at:startsAt.toISOString(),ends_at:endsAt?.toISOString()||null,is_published:false})});
   const item=created?.[0]||null;
   if(audience==='selected'&&item?.id){
    const rows=recipientIds.map(user_id=>({announcement_id:item.id,user_id}));
    await request(`${base}/rest/v1/announcement_recipients`,{method:'POST',headers:adminHeaders(key,{'Prefer':'return=minimal'}),body:JSON.stringify(rows)});
   }
   if(body.is_published)await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(item?.id||'')}`,{method:'PATCH',headers:adminHeaders(key,{'Prefer':'return=minimal'}),body:JSON.stringify({is_published:true,updated_at:new Date().toISOString()})});
   await audit(base,key,caller.id,'announcement_create',item?.id||null,{published:Boolean(body.is_published),audience,recipient_count:recipientIds.length,ends_at:endsAt?.toISOString()||null});
   const telegram=body.is_published&&startsAt<=new Date()?await broadcastProductAnnouncement(base,key,item,audience==='selected'?recipientIds:null):{status:'not_due',sent:0,failed:0,skipped:0};
   return json(200,{ok:true,announcement:{...item,is_published:Boolean(body.is_published)},audience,recipient_count:recipientIds.length,telegram});
  }
  if(action==='announcement_publish'||action==='announcement_expire'){
   const id=String(body.announcement_id||'');if(!UUID.test(id))return json(400,{error:'Identifiant d’annonce invalide.'});
   let telegram={status:'not_applicable',sent:0,failed:0,skipped:0};
   if(action==='announcement_publish'&&body.is_published){
    const before=await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}&select=id,title,body,category,is_published,starts_at,ends_at,source_url,telegram_broadcast_started_at`,{headers:adminHeaders(key)});
    const prior=before?.[0];
    const update={is_published:true,updated_at:new Date().toISOString()};
    await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:adminHeaders(key,{'Prefer':'return=minimal'}),body:JSON.stringify(update)});
    if(prior&&!prior.is_published&&new Date(prior.starts_at||0)<=new Date()){const assigned=await request(`${base}/rest/v1/announcement_recipients?select=user_id&announcement_id=eq.${encodeURIComponent(id)}`,{headers:adminHeaders(key)});const targeted=Array.isArray(assigned)&&assigned.length>0;telegram=await broadcastProductAnnouncement(base,key,prior,targeted?assigned.map(row=>row.user_id):null);}
   }else{
    const update=action==='announcement_expire'?{ends_at:new Date().toISOString(),updated_at:new Date().toISOString()}:{is_published:Boolean(body.is_published),updated_at:new Date().toISOString()};
    await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:adminHeaders(key,{'Prefer':'return=minimal'}),body:JSON.stringify(update)});
   }
   await audit(base,key,caller.id,action,id,action==='announcement_expire'?{expired:true}:{published:Boolean(body.is_published),telegram});
   return json(200,{ok:true,telegram});
  }
  return json(400,{error:'Action d’administration inconnue.'});
 }catch(error){
  const message=String(error.message||'Erreur interne');
  const status=error.statusCode|| (message.includes('ADMIN_REQUIRED')?403:message.includes('CANNOT_REMOVE_LAST_ADMIN')?409:500);
  return json(status,{error:status>=500?'Service d’administration temporairement indisponible.':message,code:error.code||null});
 }
}
