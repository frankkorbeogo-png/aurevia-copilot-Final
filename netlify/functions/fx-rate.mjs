import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
import {getFxSnapshot} from './_fx-rate.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
export async function handler(event){if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});try{const context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Connexion requise.'});}const q=new URLSearchParams(event.rawQuery||'');try{return json(200,await getFxSnapshot(q.get('from'),q.get('to')));}catch(error){return json(502,{error:error.message||'Conversion indisponible.'});}}
