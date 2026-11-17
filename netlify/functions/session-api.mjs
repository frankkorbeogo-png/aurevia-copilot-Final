import {verifyBearerUser,rpc,json} from './_session-auth.mjs';
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
 if(!['claim','heartbeat','end'].includes(body.action))return json(400,{error:'Action de session inconnue.'});
 try{
  const context=await verifyBearerUser(event);
  if(body.action==='end'){
   await rpc(context.base,context.service,'aurevia_session_end',{p_user_id:context.user.id,p_session_id:context.sessionId});
   return json(200,{ok:true,ended:true});
  }
  // Accounts created after the privacy policy rollout cannot claim or renew a
  // session until the server has a consent receipt for the current policy.
  const policyCutoff=Date.parse('2026-11-17T17:54:00Z');
  const createdAt=Date.parse(context.user.created_at||'');
  if(Number.isFinite(createdAt)&&createdAt>=policyCutoff){
   const receipt=await fetch(`${context.base}/rest/v1/privacy_policy_acceptances?user_id=eq.${encodeURIComponent(context.user.id)}&policy_version=eq.2026-11-17&select=id&limit=1`,{headers:{apikey:context.service,authorization:`Bearer ${context.service}`,accept:'application/json'},signal:AbortSignal.timeout(8000)});
   if(!receipt.ok)throw Object.assign(new Error('Vérification du consentement de confidentialité indisponible.'),{statusCode:503,code:'CONSENT_CHECK_UNAVAILABLE'});
   const rows=await receipt.json().catch(()=>[]);
   if(!Array.isArray(rows)||rows.length===0)return json(403,{error:'L’acceptation de la politique de confidentialité est obligatoire avant l’accès.',code:'CONSENT_REQUIRED'});
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
