import {randomBytes,createHash} from 'node:crypto';
import {verifyBearerUser,assertActiveSession,rpc,json} from './_session-auth.mjs';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeKey(){const bytes=randomBytes(20);let out='';for(let i=0;i<20;i++)out+=alphabet[bytes[i]%alphabet.length];return 'AUR-'+[out.slice(0,5),out.slice(5,10),out.slice(10,15),out.slice(15,20)].join('-');}
const sha256=value=>createHash('sha256').update(value,'utf8').digest('hex');
async function request(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>null);if(!response.ok)throw Object.assign(new Error(data?.message||data?.details||'Base de licences indisponible.'),{statusCode:response.status});return data;}
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
   const credentials=Array.from({length:count},()=>{const key=makeKey();return {key,key_hash:sha256(key),key_prefix:key.slice(0,9),duration_days:days};});
   const result=await rpc(base,service,'aurevia_admin_license_issue_batch',{p_actor_id:user.id,p_plan_code:plan,p_licenses:credentials.map(({key_hash,key_prefix,duration_days})=>({key_hash,key_prefix,duration_days}))});
   if(!result?.ok||!Array.isArray(result.licenses)||result.licenses.length!==count)throw new Error('La création atomique du lot de licences a échoué.');
   const issued=result.licenses.map((license,index)=>({...license,license_key:credentials[index].key}));
   return json(200,{ok:true,issued});
  }
  if(action==='set_status'){
   const id=String(body.license_id||''),status=String(body.status||'');
   if(!/^[0-9a-f-]{36}$/i.test(id)||!['suspended','revoked'].includes(status))return json(400,{error:'Action de licence invalide.'});
   const result=await rpc(base,service,'aurevia_admin_license_set_status',{p_actor_id:user.id,p_license_id:id,p_status:status});
   if(!result?.ok)return json(result?.code==='LICENSE_NOT_FOUND'?404:409,{error:result?.code||'Modification de licence refusée.'});
   return json(200,result);
  }
  return json(400,{error:'Action administrateur inconnue.'});
 }catch(error){const status=error.statusCode||500;return json(status,{error:status>=500?'Administration des licences indisponible.':error.message});}
}
