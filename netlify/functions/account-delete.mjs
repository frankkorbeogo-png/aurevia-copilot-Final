import {verifyBearerUser,assertActiveSession,json} from './_session-auth.mjs';
const headers=(key)=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'});
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}};
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
 if(body.confirmation!=='SUPPRIMER')return json(400,{error:'Confirmation de suppression manquante.'});
 try{
  const context=await verifyBearerUser(event);
  await assertActiveSession(context);
  // The last-admin check, session revocation, data purge and Auth deletion
  // run under one database transaction with a serialized administrator lock.
  const response=await fetch(`${context.base}/rest/v1/rpc/aurevia_account_delete_guarded`,{
   method:'POST',
   headers:headers(context.service),
   body:JSON.stringify({p_user_id:context.user.id}),
   signal:AbortSignal.timeout(15000)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
   const message=String(data?.message||data?.details||data?.hint||'');
   if(message.includes('LAST_ADMIN_PROTECTED'))return json(409,{error:'Le dernier administrateur ne peut pas supprimer son propre compte. Ajoutez d’abord un autre administrateur ou utilisez la procédure de récupération.',code:'LAST_ADMIN_PROTECTED'});
   if(message.includes('AUTH_USER_NOT_FOUND'))return json(404,{error:'Ce compte utilisateur n’existe plus.'});
   throw Object.assign(new Error('La suppression sécurisée du compte a échoué.'),{statusCode:response.status===404?503:500});
  }
  return json(200,{ok:true,deleted:true,application_data_deleted:true,cleaned_tables:cleanup.tables_cleaned,reauthentication_required:true});
 }catch(error){return json(error.statusCode||500,{error:error.statusCode>=500?'Service de suppression temporairement indisponible.':error.message,code:error.code||null});}
}
