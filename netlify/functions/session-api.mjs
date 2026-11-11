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
  const accepted=await rpc(context.base,context.service,'aurevia_session_touch',{
   p_user_id:context.user.id,p_session_id:context.sessionId,p_claim:body.action==='claim',p_user_agent:String(event.headers?.['user-agent']||'').slice(0,240)
  });
  if(accepted!==true)return json(409,{error:'Une autre session est déjà active sur ce compte. Cette session a été déconnectée.',code:'SESSION_REPLACED'});
  return json(200,{ok:true,active:true,heartbeat_seconds:30});
 }catch(error){return json(error.statusCode||500,{error:error.statusCode===500?'Service de session temporairement indisponible.':error.message,code:error.code||null});}
}
