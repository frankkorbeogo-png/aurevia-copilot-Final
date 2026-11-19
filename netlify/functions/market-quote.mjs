import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
import {MARKET_PROVIDER_SYMBOLS} from '../../market-catalog.js';
import {getMarketStatus} from '../../market-hours.js';
const ALLOWED=new Set(MARKET_PROVIDER_SYMBOLS);
const cache=new Map(),inFlight=new Map(),quotaBlockedUntil=new Map();
const MAX_QUOTE_AGE_MS=90000;
const QUOTE_CACHE_TTL_MS=30000;
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'same-origin'},body:JSON.stringify(body)});
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}};
 if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});
 try{const context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Connexion requise.',code:error.code||null});}
 const symbol=(new URLSearchParams(event.rawQuery||'').get('symbol')||'').toUpperCase();
 if(!ALLOWED.has(symbol))return json(400,{error:'Instrument non autorisé.'});
 const marketStatus=getMarketStatus(symbol);
 const key=process.env.TWELVEDATA_API_KEY;if(!key)return json(503,{error:'Flux Twelve Data non configuré côté serveur.'});
 const cached=cache.get(symbol),now=Date.now();
 if(cached&&now-cached.at<QUOTE_CACHE_TTL_MS&&now-Date.parse(cached.value.quoteAt)<=MAX_QUOTE_AGE_MS)return json(200,{...cached.value,cached:true,ageSeconds:Math.max(0,Math.floor((now-Date.parse(cached.value.quoteAt))/1000))});
 const blockedUntil=quotaBlockedUntil.get(key)||0;
 if(now<blockedUntil)return json(429,{error:'Quota Twelve Data temporairement bloqué. Aucun nouvel appel fournisseur ne sera tenté avant la fin de la temporisation.',code:'TWELVEDATA_QUOTA',retryAfterSeconds:Math.ceil((blockedUntil-now)/1000)});
 if(inFlight.has(symbol))return inFlight.get(symbol);

 const task=(async()=>{
  try{
   const url=new URL('https://api.twelvedata.com/quote');url.searchParams.set('symbol',symbol);url.searchParams.set('interval','1min');url.searchParams.set('timezone','UTC');url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');
   const response=await fetch(url,{signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>({}));
   const price=Number(data.close??data.price),rawQuoteAt=data.last_quote_at??data.timestamp??data.datetime;const numericTimestamp=Number(rawQuoteAt);const quoteAt=Number.isFinite(numericTimestamp)&&numericTimestamp>0?(numericTimestamp>1e12?numericTimestamp:numericTimestamp*1000):(typeof rawQuoteAt==='string'?Date.parse(/(Z|[+-][0-9]{2}:?[0-9]{2})$/i.test(rawQuoteAt)?rawQuoteAt:rawQuoteAt.replace(' ','T')+'Z'):NaN),age=Date.now()-quoteAt;
   if(!response.ok||data.status==='error'||data.code||!Number.isFinite(price)||price<=0){
    const quota=/quota|credits|api credits|rate limit|requests per minute/i.test(String(data.message||''))||Number(data.code)===429||response.status===429;
    if(quota)quotaBlockedUntil.set(key,Date.now()+60000);
    return json(quota?429:502,{error:quota?'Quota Twelve Data atteint. AUREVIA suspend les nouveaux appels pendant 60 secondes.':data.message||'Cours Twelve Data indisponible.',code:quota?'TWELVEDATA_QUOTA':'TWELVEDATA_QUOTE_ERROR',retryAfterSeconds:quota?60:undefined});
   }
   if(!Number.isFinite(age)||age< -5000||age>7*24*60*60*1000)return json(502,{error:'La dernière cotation est trop ancienne ou son horodatage est invalide.',code:'QUOTE_STALE',quoteAt:Number.isFinite(quoteAt)?new Date(quoteAt).toISOString():null});
   const freshness=age<=MAX_QUOTE_AGE_MS?'recent':'last_close';
   const value={symbol,price,quoteAt:new Date(quoteAt).toISOString(),ageSeconds:Math.max(0,Math.floor(age/1000)),fetchedAt:new Date().toISOString(),source:'Twelve Data Quote',interval:'1min',freshness,marketOpen:freshness==='recent'&&marketStatus.tradable,marketStatus:freshness!=='recent'?'LAST_QUOTE':(marketStatus.tradable?'OPEN':(marketStatus.reason||'CLOSED')),displayLabel:freshness==='recent'?'Cours récent':'Dernière cotation disponible · marché fermé ou sans nouvelle cotation'};
   cache.set(symbol,{at:Date.now(),value});return json(200,value);
  }catch(error){return json(502,{error:error.name==='TimeoutError'?'Délai Twelve Data dépassé.':'Impossible de récupérer le cours Twelve Data.'});}
 })();
 inFlight.set(symbol,task);try{return await task;}finally{inFlight.delete(symbol);}
}
