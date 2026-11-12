import {verifyBearerUser,assertActiveSession,json} from './_session-auth.mjs';

export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let context;
 try{context=await verifyBearerUser(event);await assertActiveSession(context);}
 catch(error){return json(error.statusCode||401,{error:error.message||'Session invalide.',code:error.code||null});}
 const {base,service,user}=context;
 const headers={apikey:service,authorization:`Bearer ${service}`,'content-type':'application/json'};
 try{
  const deleted=await fetch(`${base}/rest/v1/telegram_connections?user_id=eq.${encodeURIComponent(user.id)}`,{method:'DELETE',headers:{...headers,prefer:'return=minimal'},signal:AbortSignal.timeout(8000)});
  if(!deleted.ok){const detail=await deleted.json().catch(()=>null);return json(502,{error:detail?.message||'Impossible de supprimer la liaison Telegram.'});}
  // Invalider aussi tout code de liaison encore en attente.
  const read=await fetch(`${base}/rest/v1/user_preferences?select=preferences&user_id=eq.${encodeURIComponent(user.id)}`,{headers,signal:AbortSignal.timeout(8000)});
  if(!read.ok)return json(200,{ok:true,warning:'Liaison supprimée ; le nettoyage du code temporaire reste à vérifier.'});
  const rows=await read.json();
  if(rows[0]?.preferences){
   const preferences={...rows[0].preferences};delete preferences.telegram_pair_code;delete preferences.telegram_pair_expires_at;
   const updated=await fetch(`${base}/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(user.id)}`,{method:'PATCH',headers:{...headers,prefer:'return=minimal'},body:JSON.stringify({preferences,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(8000)});
   if(!updated.ok)return json(200,{ok:true,warning:'Liaison supprimée ; le code temporaire n’a pas pu être nettoyé.'});
  }
  return json(200,{ok:true});
 }catch(error){return json(502,{error:error.name==='TimeoutError'?'Le service a expiré. Réessayez.':'Erreur serveur pendant la déliaison Telegram.'});}
}
