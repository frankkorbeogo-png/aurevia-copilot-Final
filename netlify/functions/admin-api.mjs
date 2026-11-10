const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'same-origin','vary':'origin'},body:JSON.stringify(body)});
const env=n=>(process.env[n]||'').trim();
async function request(url,options={}){const r=await fetch(url,options);const body=await r.json().catch(()=>null);if(!r.ok)throw new Error(body?.message||body?.msg||body?.error_description||body?.error||`Service Supabase indisponible (${r.status}).`);return body;}
function headers(key,token=key,extra={}){return {apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',...extra};}
async function rpc(base,key,name,args){return request(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:headers(key),body:JSON.stringify(args)});}
async function audit(base,key,actor,action,target=null,details={}){await rpc(base,key,'aurevia_admin_audit',{p_actor_id:actor,p_action:action,p_target_user_id:target,p_details:details});}
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}};
 if(!['GET','POST'].includes(event.httpMethod))return json(405,{error:'Méthode non autorisée.'});
 const base=env('SUPABASE_URL').replace(/\/$/,''),key=env('SUPABASE_SERVICE_ROLE_KEY'),pub=env('SUPABASE_PUBLISHABLE_KEY')||env('SUPABASE_ANON_KEY');
 if(!base||!key||!pub)return json(503,{error:'Administration serveur non configurée.'});
 const token=(event.headers?.authorization||event.headers?.Authorization||'').replace(/^Bearer\s+/i,'');if(!token)return json(401,{error:'Connexion requise.'});
 try{
  const caller=await request(`${base}/auth/v1/user`,{headers:headers(pub,token)});if(!caller?.id||!caller.email)return json(401,{error:'Session invalide.'});
  let body={};if(event.httpMethod==='POST'){try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}}
  if(event.httpMethod==='POST'&&body.action==='bootstrap'){
   const configured=env('AUREVIA_BOOTSTRAP_ADMIN_EMAIL');if(!configured||configured.toLowerCase()!==caller.email.toLowerCase())return json(403,{error:'Le compte connecté ne correspond pas à l’adresse de premier administrateur configurée.'});
   const result=await rpc(base,key,'aurevia_bootstrap_admin',{p_user_id:caller.id,p_email:caller.email});return json(200,{ok:true,bootstrap:result});
  }
  const isAdmin=await rpc(base,key,'aurevia_is_admin',{p_user_id:caller.id});if(isAdmin!==true)return json(403,{error:'Accès administrateur refusé.'});
  if(event.httpMethod==='GET'){
   const page=Math.max(1,Math.min(1000,Number.parseInt(event.queryStringParameters?.page||'1',10)||1));
   const [users,profiles,stats,announcements,auditLog]=await Promise.all([
    request(`${base}/auth/v1/admin/users?page=${page}&per_page=100`,{headers:headers(key)}),
    request(`${base}/rest/v1/profiles?select=id,display_name,role,created_at&order=created_at.desc&limit=100`,{headers:headers(key)}),
    Promise.all(['profiles','trading_journal','trading_position_groups','telegram_connections'].map(async table=>{const r=await fetch(`${base}/rest/v1/${table}?select=id`,{method:'HEAD',headers:{apikey:key,authorization:`Bearer ${key}`,'Prefer':'count=exact','Range':'0-0'}});const range=r.headers.get('content-range')||'';return [table,Number(range.split('/')[1])||0];})),
    request(`${base}/rest/v1/announcements?select=id,title,body,category,is_published,starts_at,ends_at,created_at&order=created_at.desc&limit=50`,{headers:headers(key)}),
    rpc(base,key,'aurevia_admin_audit_list',{p_actor_id:caller.id})
   ]);
   const authUsers=users.users||[];const prof=Array.isArray(profiles)?profiles:[];const byId=new Map(prof.map(x=>[x.id,x]));
   return json(200,{ok:true,users:authUsers.map(u=>({id:u.id,email:u.email,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,banned_until:u.banned_until||null,confirmed_at:u.confirmed_at||null,display_name:byId.get(u.id)?.display_name||null,role:byId.get(u.id)?.role||'user'})),stats:Object.fromEntries(stats),announcements:Array.isArray(announcements)?announcements:[],auditLog:Array.isArray(auditLog)?auditLog:[],pagination:{page,per_page:100,returned:authUsers.length,has_more:authUsers.length===100}});
  }
  const target=String(body.user_id||'');
  if(['revoke_admin','suspend'].includes(body.action)&&target===caller.id)return json(409,{error:'Pour éviter de perdre votre accès, vous ne pouvez pas suspendre ou retirer vos propres droits depuis cette console.'});
  if(['grant_admin','revoke_admin','suspend','activate'].includes(body.action)&&! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target))return json(400,{error:'Identifiant utilisateur invalide.'});
  if(body.action==='grant_admin'||body.action==='revoke_admin'){
   const result=await rpc(base,key,'aurevia_admin_manage',{p_actor_id:caller.id,p_target_user_id:target,p_action:body.action,p_details:{source:'admin_console'}});return json(200,{ok:true,result});
  }
  if(body.action==='suspend'||body.action==='activate'){
   const ban_duration=body.action==='suspend'?'876000h':'none';
   await request(`${base}/auth/v1/admin/users/${encodeURIComponent(target)}`,{method:'PUT',headers:headers(key),body:JSON.stringify({ban_duration})});
   await audit(base,key,caller.id,body.action,target,{source:'admin_console'});return json(200,{ok:true,action:body.action});
  }
  if(body.action==='announcement_create'){
   const title=String(body.title||'').trim().slice(0,120),content=String(body.body||'').trim().slice(0,4000),category=String(body.category||'general').trim().slice(0,40);
   if(!title||!content)return json(400,{error:'Titre et contenu obligatoires.'});
   const created=await request(`${base}/rest/v1/announcements`,{method:'POST',headers:headers(key,key,{'Prefer':'return=representation'}),body:JSON.stringify({title,body:content,category,source_url:body.source_url||null,starts_at:body.starts_at||new Date().toISOString(),ends_at:body.ends_at||null,is_published:Boolean(body.is_published)})});
   await audit(base,key,caller.id,'announcement_create',created?.[0]?.id||null,{published:Boolean(body.is_published)});return json(200,{ok:true,announcement:created?.[0]||null});
  }
  if(body.action==='announcement_publish'){
   const id=String(body.announcement_id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return json(400,{error:'Identifiant d’annonce invalide.'});
   await request(`${base}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:headers(key,key,{'Prefer':'return=minimal'}),body:JSON.stringify({is_published:Boolean(body.is_published),updated_at:new Date().toISOString()})});
   await audit(base,key,caller.id,'announcement_publish',id,{published:Boolean(body.is_published)});return json(200,{ok:true});
  }
  return json(400,{error:'Action d’administration inconnue.'});
 }catch(error){const message=String(error.message||'Erreur interne');const status=message.includes('ADMIN_REQUIRED')?403:message.includes('BOOTSTRAP_ALREADY_USED')||message.includes('CANNOT_REMOVE_LAST_ADMIN')?409:message.includes('EMAIL_MISMATCH')?403:500;return json(status,{error:status===500?'Une erreur serveur est survenue.':message});}
}
