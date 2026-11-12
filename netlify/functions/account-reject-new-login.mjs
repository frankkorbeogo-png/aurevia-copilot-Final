import {verifyBearerUser,json} from './_session-auth.mjs';
const headers=key=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'});
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
 if(body.confirmation!=='REJECT_NEW_LOGIN'||!Number.isFinite(Number(body.startedAt)))return json(400,{error:'Demande de refus invalide.'});
 try{
  const context=await verifyBearerUser(event);
  const startedAt=Number(body.startedAt),createdAt=Date.parse(context.user.created_at||'');
  const age=Date.now()-startedAt;
  if(!Number.isFinite(createdAt)||age<0||age>15*60*1000||createdAt<startedAt-30000||createdAt>startedAt+15*60*1000){
   return json(403,{error:'Ce compte ne correspond pas à une création déclenchée par cette tentative de connexion.'});
  }
  const response=await fetch(`${context.base}/auth/v1/admin/users/${encodeURIComponent(context.user.id)}`,{method:'DELETE',headers:headers(context.service),signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(data?.msg||data?.message||'Suppression du compte temporaire impossible.'),{statusCode:response.status});
  return json(200,{ok:true,deleted:true,reason:'signup_required'});
 }catch(error){return json(error.statusCode||500,{error:error.statusCode>=500?'Service de vérification du compte indisponible.':error.message});}
}
