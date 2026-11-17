import {verifyBearerUser,json} from './_session-auth.mjs';
const VERSION='2026-11-17-v1';
const headers=key=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'});
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}};
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
 if(body.policyVersion!==VERSION||body.acceptanceMethod!=='google_oauth_pre_signup')return json(400,{error:'Version ou méthode d’acceptation invalide.'});
 const acceptedAt=Date.parse(body.acceptedAt||'');
 if(!Number.isFinite(acceptedAt)||acceptedAt>Date.now()+5*60*1000||acceptedAt<Date.parse('2026-11-17T00:00:00Z'))return json(400,{error:'Horodatage de consentement invalide.'});
 try{const context=await verifyBearerUser(event);const createdAt=Date.parse(context.user.created_at||'');
 if(!Number.isFinite(createdAt)||createdAt<Date.parse('2026-11-17T00:00:00Z'))return json(409,{error:'Cette procédure est réservée aux nouvelles inscriptions.'});
 if(acceptedAt>createdAt+5*60*1000)return json(400,{error:'La date d’acceptation doit précéder la création du compte.'});
 const response=await fetch(`${context.base}/rest/v1/privacy_policy_acceptances?on_conflict=user_id,policy_version`,{method:'POST',headers:{...headers(context.service),prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:context.user.id,policy_version:VERSION,accepted_at:new Date(acceptedAt).toISOString(),acceptance_method:'google_oauth_pre_signup'}),signal:AbortSignal.timeout(8000)});
 if(!response.ok){console.error('[AUREVIA_PRIVACY_CONSENT]',response.status);return json(503,{error:'Le consentement n’a pas pu être enregistré. Réessayez sans fermer cette page.'});}
 return json(200,{ok:true,accepted:true,policyVersion:VERSION,acceptedAt:new Date(acceptedAt).toISOString()});
 }catch(error){return json(error.statusCode||500,{error:error.statusCode>=500?'Service de confidentialité temporairement indisponible.':error.message});}
}
