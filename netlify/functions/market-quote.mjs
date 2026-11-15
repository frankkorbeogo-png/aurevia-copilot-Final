import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
import {MARKET_PROVIDER_SYMBOLS} from '../../market-catalog.js';
const ALLOWED=new Set(MARKET_PROVIDER_SYMBOLS);
const cache=new Map();
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'same-origin'},body:JSON.stringify(body)});
function providerFailure(httpStatus,data){
 const message=String(data?.message||data?.detail||data?.code||'Réponse Twelve Data inexploitable.').slice(0,300);
 const providerCode=Number(data?.code);
 if(httpStatus===401||httpStatus===403||providerCode===401||providerCode===403)return {statusCode:502,code:'TWELVEDATA_AUTH_ERROR',retryable:false,error:'Le fournisseur refuse la clé API ou son accès.',detail:message};
 if(httpStatus===429||providerCode===429||/quota|credits|rate limit|requests per minute/i.test(message))return {statusCode:429,code:'TWELVEDATA_QUOTA',retryable:false,error:'Quota Twelve Data atteint. Réessayez après son renouvellement.',detail:message};
 if(httpStatus>=500)return {statusCode:503,code:'TWELVEDATA_UPSTREAM',retryable:true,error:'Twelve Data rencontre une indisponibilité temporaire.',detail:message};
 return {statusCode:502,code:'TWELVEDATA_RESPONSE',retryable:false,error:'Twelve Data a retourné une réponse inexploitable.',detail:message};
}
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}};
 if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});
 try{const context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Connexion requise.',code:error.code||null});}
 const symbol=(new URLSearchParams(event.rawQuery||'').get('symbol')||'').toUpperCase();
 if(!ALLOWED.has(symbol))return json(400,{error:'Instrument non autorisé.'});
 const key=process.env.TWELVEDATA_API_KEY;if(!key)return json(503,{error:'Flux Twelve Data non configuré côté serveur.',code:'TWELVEDATA_NOT_CONFIGURED'});
 const cached=cache.get(symbol),age=cached?Date.now()-cached.at:Infinity;
 if(cached&&age<30000)return json(200,{...cached.value,cached:true,stale:false});
 const url=new URL('https://api.twelvedata.com/quote');url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',key);url.searchParams.set('timezone','UTC');url.searchParams.set('format','JSON');
 let failure=null;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(9000)});
   const data=await response.json().catch(()=>({}));
   const price=Number(data.close??data.price);
   if(response.ok&&data.status!=='error'&&!data.code&&Number.isFinite(price)&&price>0){
    const stamp=Number(data.last_quote_at??data.timestamp);
    const asOf=Number.isFinite(stamp)&&stamp>0?new Date(stamp*1000).toISOString():(data.datetime&&Number.isFinite(Date.parse(data.datetime))?new Date(data.datetime).toISOString():null);
    const ageSeconds=asOf?Math.floor((Date.now()-Date.parse(asOf))/1000):null;
    const freshness=ageSeconds===null?'unknown':ageSeconds < -300?'future':ageSeconds<=120?'recent':'stale';
    if(freshness==='future')return json(502,{error:'Horodatage Twelve Data situé dans le futur : cours refusé.',code:'TWELVEDATA_FUTURE_TIMESTAMP',retryable:false,asOf});
    const value={symbol,price,asOf,ageSeconds,freshness,fetchedAt:new Date().toISOString(),source:'Twelve Data',realtime:false};
    cache.set(symbol,{at:Date.now(),value});
    return json(200,{...value,cached:false,stale:false});
   }
   failure=providerFailure(response.status,data);
   if(!failure.retryable)break;
  }catch(error){
   failure={statusCode:503,code:'TWELVEDATA_NETWORK',retryable:true,error:error.name==='TimeoutError'?'Délai Twelve Data dépassé.':'Impossible de joindre Twelve Data.',detail:String(error.message||error).slice(0,250)};
  }
  if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));
 }
 if(cached&&age<=120000&&failure?.retryable){
  return json(200,{...cached.value,cached:true,stale:true,staleAgeSeconds:Math.floor(age/1000),providerWarning:failure.error,providerCode:failure.code});
 }
 const result=failure||{statusCode:502,code:'TWELVEDATA_RESPONSE',retryable:false,error:'Cours Twelve Data indisponible.'};
 return json(result.statusCode,{error:result.error,detail:result.detail||null,code:result.code,retryable:result.retryable});
}
