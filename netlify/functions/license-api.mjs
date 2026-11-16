import {createHash} from 'node:crypto';
import {verifyBearerUser,rpc,json} from './_session-auth.mjs';

const sha256=value=>createHash('sha256').update(String(value),'utf8').digest('hex');
async function activeSession(context){
 const active=await rpc(context.base,context.service,'aurevia_session_is_active_for_user',{p_user_id:context.user.id,p_session_id:context.sessionId});
 if(active!==true)throw Object.assign(new Error('Session AUREVIA remplacée ou révoquée.'),{statusCode:409,code:'SESSION_REPLACED'});
}
export async function handler(event){
 if(event.httpMethod!=='GET'&&event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 try{
  const context=await verifyBearerUser(event);await activeSession(context);
  if(event.httpMethod==='GET'){
   const status=await rpc(context.base,context.service,'aurevia_license_status',{p_user_id:context.user.id});
   return json(200,status||{ok:false,code:'STATUS_UNAVAILABLE'});
  }
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
  const key=String(body.license_key||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!/^AUR-[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/.test(key))return json(400,{ok:false,code:'INVALID_KEY',error:'Format de clé invalide.'});
  const result=await rpc(context.base,context.service,'aurevia_license_activate',{p_user_id:context.user.id,p_key_hash:sha256(key)});
  if(!result?.ok)return json(400,result||{ok:false,code:'ACTIVATION_FAILED'});
  return json(200,result);
 }catch(error){
  const status=error.statusCode||500;
  return json(status,{ok:false,error:status>=500?'Service de licence temporairement indisponible.':error.message,code:error.code||null});
 }
}
