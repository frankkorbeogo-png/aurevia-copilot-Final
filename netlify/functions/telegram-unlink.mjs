import {verifyBearerUser,assertActiveSession,json} from './_session-auth.mjs';
const headers=(key)=>({apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'});
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}};
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let context;
 try{context=await verifyBearerUser(event);await assertActiveSession(context);}
 catch(error){return json(error.statusCode||401,{ok:false,error:error.message||'Session invalide.',code:error.code||null});}
 const {base,service,user}=context,auth=headers(service),userFilter=`user_id=eq.${encodeURIComponent(user.id)}`;
 try{
  const deleted=await fetch(`${base}/rest/v1/telegram_connections?${userFilter}`,{method:'DELETE',headers:{...auth,prefer:'return=representation'},signal:AbortSignal.timeout(10000)});
  if(!deleted.ok){const detail=await deleted.json().catch(()=>null);return json(502,{ok:false,error:detail?.message||'Impossible de supprimer la liaison Telegram.'});}
  // Confirm the association is really gone; a successful HTTP response alone is not enough.
  const check=await fetch(`${base}/rest/v1/telegram_connections?select=user_id&${userFilter}`,{headers:auth,signal:AbortSignal.timeout(8000)});
  if(!check.ok)return json(502,{ok:false,error:'La suppression a été demandée, mais son résultat n’a pas pu être vérifié.'});
  const remaining=await check.json();
  if(Array.isArray(remaining)&&remaining.length)return json(502,{ok:false,error:'La liaison Telegram existe encore. Aucune confirmation de déconnexion ne peut être donnée.'});
  let warning=null;
  const read=await fetch(`${base}/rest/v1/user_preferences?select=preferences&${userFilter}`,{headers:auth,signal:AbortSignal.timeout(8000)});
  if(!read.ok)warning='La liaison est supprimée, mais le code temporaire n’a pas pu être vérifié.';
  else{
   const rows=await read.json();
   if(rows[0]?.preferences){
    const preferences={...rows[0].preferences};delete preferences.telegram_pair_code;delete preferences.telegram_pair_expires_at;
    const updated=await fetch(`${base}/rest/v1/user_preferences?${userFilter}`,{method:'PATCH',headers:{...auth,prefer:'return=minimal'},body:JSON.stringify({preferences,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(8000)});
    if(!updated.ok)warning='La liaison est supprimée, mais le code temporaire n’a pas pu être nettoyé.';
   }
  }
  return json(200,{ok:true,unlinked:true,warning});
 }catch(error){return json(502,{ok:false,error:error.name==='TimeoutError'?'Le service a expiré. Réessayez.':'Erreur serveur pendant la déliaison Telegram.'});}
}
