import {verifyBearerUser,json} from './_session-auth.mjs';

const POLICY_VERSION='2026-11-17';
const headers=key=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:'resolution=merge-duplicates,return=representation'});

export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
 if(body.accepted!==true||body.policy_version!==POLICY_VERSION)return json(400,{ok:false,code:'CONSENT_REQUIRED',error:'L’acceptation explicite de la politique de confidentialité est requise.'});
 try{
  const context=await verifyBearerUser(event);
  const response=await fetch(`${context.base}/rest/v1/privacy_policy_acceptances?on_conflict=user_id,policy_version`,{
   method:'POST',headers:headers(context.service),
   body:JSON.stringify({user_id:context.user.id,policy_version:POLICY_VERSION,acceptance_method:'google_oauth_pre_signup'}),
   signal:AbortSignal.timeout(10000)
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(payload?.message||payload?.details||'Enregistrement du consentement impossible.'),{statusCode:response.status});
  return json(200,{ok:true,policy_version:POLICY_VERSION,accepted_at:payload?.[0]?.accepted_at||new Date().toISOString()});
 }catch(error){
  const status=error.statusCode||500;
  return json(status,{ok:false,code:status>=500?'CONSENT_SAVE_UNAVAILABLE':'CONSENT_INVALID',error:status>=500?'Le consentement n’a pas pu être enregistré. Réessayez.':error.message});
 }
}
