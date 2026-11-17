import {verifyBearerUser,rpc,json} from './_session-auth.mjs';
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
 if(!['claim','heartbeat','end'].includes(body.action))return json(400,{error:'Action de session inconnue.'});
 try{
  const context=await verifyBearerUser(event);
  // Newly created accounts must have a server-side record of the current privacy-policy acceptance.
  if(body.action==='claim' && Date.parse(context.user.created_at||'')>=Date.parse('2026-11-17T00:00:00Z')){
   const consentUrl=new URL(`${context.base}/rest/v1/privacy_policy_acceptances`);
   consentUrl.searchParams.set('select','id');
   consentUrl.searchParams.set('user_id',`eq.${context.user.id}`);
   consentUrl.searchParams.set('policy_version','eq.2026-11-17-v1');
   const consentResponse=await fetch(consentUrl,{headers:{apikey:context.service,authorization:`Bearer ${context.service}`},signal:AbortSignal.timeout(8000)});
   const consentRows=await consentResponse.json().catch(()=>null);
   if(!consentResponse.ok)throw Object.assign(new Error('Vérification de l’acceptation de confidentialité indisponible.'),{statusCode:503});
   if(!Array.isArray(consentRows)||consentRows.length!==1)return json(403,{error:'La politique de confidentialité doit être acceptée avant l’accès à AUREVIA.',code:'PRIVACY_ACCEPTANCE_REQUIRED'});
  }
  if(body.action==='end'){
   await rpc(context.base,context.service,'aurevia_session_end',{p_user_id:context.user.id,p_session_id:context.sessionId});
   return json(200,{ok:true,ended:true});
  }
  const accepted=await rpc(context.base,context.service,'aurevia_session_touch',{
   p_user_id:context.user.id,p_session_id:context.sessionId,p_claim:body.action==='claim',p_user_agent:String(event.headers?.['user-agent']||'').slice(0,240)
  });
  if(accepted!==true)return json(409,{error:'Une autre session est déjà active sur ce compte. Cette session a été déconnectée.',code:'SESSION_REPLACED'});
  return json(200,{ok:true,active:true,heartbeat_seconds:30});
 }catch(error){
  console.error('[AUREVIA_SESSION_API] validation failed', {statusCode:error.statusCode||500, code:error.code||null, message:error.message||'unknown'});
  const status=error.statusCode||500;
  return json(status,{error:status>=500?'Le serveur AUREVIA ne parvient pas à confirmer la session. Réessayez dans quelques instants.':error.message,code:error.code||(status>=500?'SESSION_BACKEND_ERROR':null)});
 }
}
