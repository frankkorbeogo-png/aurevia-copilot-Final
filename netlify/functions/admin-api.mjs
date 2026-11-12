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
   const created=await request(`${base}/rest/v1/announcements`,{method:'POST',headers:adminHeaders(key,{'Prefer':'return=representation'}),body:JSON.stringify({title,body:content,category,source_url:body.source_url||null,starts_at:startsAt.toISOString(),ends_at:endsAt?.toISOString()||null,is_published:Boolean(body.is_published)})});
   await audit(base,key,caller.id,'announcement_create',created?.[0]?.id||null,{published:Boolean(body.is_published),ends_at:endsAt?.toISOString()||null});
   return json(200,{ok:true,announcement:created?.[0]||null});
  }
  if(action==='announcement_publish'||action==='announcement_expire'){
   const id=String(body.announcement_id||'');if(!UUID.test(id))return json(400,{error:'Identifiant d’annonce invalide.'});
   const update=action==='announcement_expire'?{ends_at:new Date().toISOString(),updated_at:new Date().toISOString()}:{is_published:Boolean(body.is_published),updated_at:new Date().toISOString()};
   await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:adminHeaders(key,{'Prefer':'return=minimal'}),body:JSON.stringify(update)});
   await audit(base,key,caller.id,action,id,action==='announcement_expire'?{expired:true}:{published:Boolean(body.is_published)});
   return json(200,{ok:true});
  }
  return json(400,{error:'Action d’administration inconnue.'});
 }catch(error){
  const message=String(error.message||'Erreur interne');
  const status=error.statusCode|| (message.includes('ADMIN_REQUIRED')?403:message.includes('CANNOT_REMOVE_LAST_ADMIN')?409:500);
  return json(status,{error:status>=500?'Service d’administration temporairement indisponible.':message,code:error.code||null});
 }
}
