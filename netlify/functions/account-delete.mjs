import {verifyBearerUser,json} from './_session-auth.mjs';
const headers=(key)=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'});
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}};
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Corps JSON invalide.'});}
 if(body.confirmation!=='SUPPRIMER')return json(400,{error:'Confirmation de suppression manquante.'});
 try{
  const context=await verifyBearerUser(event);
  // A final server-side identity check prevents deleting a different account.
  const response=await fetch(`${context.base}/auth/v1/admin/users/${encodeURIComponent(context.user.id)}`,{method:'DELETE',headers:headers(context.service),signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(data?.msg||data?.message||'La suppression du compte a échoué.'),{statusCode:response.status});
  return json(200,{ok:true,deleted:true,reauthentication_required:true});
 }catch(error){return json(error.statusCode||500,{error:error.statusCode>=500?'Service de suppression temporairement indisponible.':error.message,code:error.code||null});}
}
