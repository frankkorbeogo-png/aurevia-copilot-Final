import {randomBytes,createHash} from 'node:crypto';
import {verifyBearerUser,assertActiveSession,rpc,json} from './_session-auth.mjs';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeKey(){
 const bytes=randomBytes(20);let out='';
 for(let i=0;i<20;i++)out+=alphabet[bytes[i]%alphabet.length];
 return 'AUR-'+[out.slice(0,5),out.slice(5,10),out.slice(10,15),out.slice(15,20)].join('-');
}
const sha256=value=>createHash('sha256').update(value,'utf8').digest('hex');
async function request(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(new Error(data?.message||data?.details||'Base de licences indisponible.'),{statusCode:response.status});
 return data;
}
const headers=key=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'});
export async function handler(event){
 if(event.httpMethod!=='GET'&&event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 try{
  const context=await verifyBearerUser(event);await assertActiveSession(context);
  const {base,service,user}=context;
  if(await rpc(base,service,'aurevia_is_admin',{p_user_id:user.id})!==true)return json(403,{error:'Accès administrateur refusé.'});
  if(event.httpMethod==='GET'){
   const rows=await request(`${base}/rest/v1/aurevia_licenses?select=id,key_prefix,plan_code,status,duration_days,starts_at,expires_at,assigned_user_id,activated_at,created_at&order=created_at.desc&limit=200`,{headers:headers(service)});
   return json(200,{ok:true,licenses:Array.isArray(rows)?rows:[]});
  }
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
  const action=String(body.action||'');
  if(action==='issue'){
   const count=Math.max(1,Math.min(50,Number.parseInt(body.count||'1',10)||1));
   const days=body.duration_days===null||body.duration_days==='unlimited'?null:Number.parseInt(body.duration_days,10);
   if(days!==null&&(!Number.isInteger(days)||days<1||days>3650))return json(400,{error:'Durée de licence invalide.'});
   const plan=String(body.plan_code||'standard').trim().toLowerCase();
   if(!/^[a-z0-9_-]{2,32}$/.test(plan))return json(400,{error:'Formule invalide.'});
   const issued=[];
   for(let i=0;i<count;i++){
    const key=makeKey(),hash=sha256(key),prefix=key.slice(0,9);
    const rows=await request(`${base}/rest/v1/aurevia_licenses?select=id,key_prefix,plan_code,status,duration_days,created_at`,{
     method:'POST',headers:{...headers(service),Prefer:'return=representation'},
     body:JSON.stringify({key_hash:hash,key_prefix:prefix,plan_code:plan,status:'issued',duration_days:days,max_active_sessions:1,created_by:user.id})
    });
    const row=rows?.[0];if(!row)throw new Error('La clé a été créée sans retour de confirmation.');
    await request(`${base}/rest/v1/aurevia_license_events`,{method:'POST',headers:{...headers(service),Prefer:'return=minimal'},body:JSON.stringify({license_id:row.id,event_type:'license_issued',details:{plan_code:plan,duration_days:days,created_by:user.id}})});
    issued.push({...row,license_key:key});
   }
   return json(200,{ok:true,issued});
  }
  if(action==='set_status'){
   const id=String(body.license_id||'');
   const status=String(body.status||'');
   if(!/^[0-9a-f-]{36}$/i.test(id)||!['suspended','revoked'].includes(status))return json(400,{error:'Action de licence invalide.'});
   const rows=await request(`${base}/rest/v1/aurevia_licenses?id=eq.${encodeURIComponent(id)}&select=id,assigned_user_id,status`,{headers:headers(service)});
   const prior=rows?.[0];if(!prior)return json(404,{error:'Licence introuvable.'});
   const updated=await request(`${base}/rest/v1/aurevia_licenses?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{...headers(service),Prefer:'return=representation'},body:JSON.stringify({status,updated_at:new Date().toISOString()})});
   if(prior.assigned_user_id){
    await request(`${base}/rest/v1/aurevia_account_access?user_id=eq.${encodeURIComponent(prior.assigned_user_id)}`,{method:'PATCH',headers:headers(service),body:JSON.stringify({access_status:status,updated_at:new Date().toISOString()})});
    await request(`${base}/rest/v1/aurevia_license_events`,{method:'POST',headers:{...headers(service),Prefer:'return=minimal'},body:JSON.stringify({license_id:id,user_id:prior.assigned_user_id,event_type:status==='suspended'?'license_suspended':'license_revoked',details:{admin_id:user.id}})});
   }
   return json(200,{ok:true,license:updated?.[0]||null});
  }
  return json(400,{error:'Action administrateur inconnue.'});
 }catch(error){
  const status=error.statusCode||500;
  return json(status,{error:status>=500?'Administration des licences indisponible.':error.message});
 }
}
