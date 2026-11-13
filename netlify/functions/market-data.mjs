import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
import {getMarketStatus} from '../../market-hours.js';
const ALLOWED=new Set(['XAU/USD','XAG/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','BTC/USD','ETH/USD']);
const INTERVALS=new Set(['1min','5min','15min','30min','1h','4h','1day']);
const cache=new Map();
const CACHE_FRESH_MS=60000;
const CACHE_STALE_MAX_MS=5*60*1000;
const rate=new Map();
function rateAllowed(key,limit=36){const now=Date.now(),item=rate.get(key);if(!item||now-item.start>60000){rate.set(key,{start:now,count:1});return true;}if(item.count>=limit)return false;item.count++;return true;}
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'same-origin'},body:JSON.stringify(body)});
function providerFailure(status,message){const normalized=String(message||'').slice(0,500);if(status===401||status===403)return {statusCode:502,code:'TWELVEDATA_AUTH_ERROR',retryable:false,error:'Le fournisseur de données refuse la clé API ou son accès.',detail:`Twelve Data HTTP ${status}: ${normalized}`};if(status===429)return {statusCode:429,code:'TWELVEDATA_QUOTA',retryable:true,error:'Quota Twelve Data atteint. Attendez le renouvellement du quota avant de réessayer.',detail:`Twelve Data HTTP 429: ${normalized}`};if(status>=500)return {statusCode:503,code:'TWELVEDATA_UPSTREAM',retryable:true,error:'Twelve Data rencontre une indisponibilité temporaire.',detail:`Twelve Data HTTP ${status}: ${normalized}`};return {statusCode:502,code:'TWELVEDATA_RESPONSE',retryable:false,error:'Twelve Data a retourné une réponse inexploitable.',detail:`Twelve Data HTTP ${status}: ${normalized}`};}
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}};
 if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});
 let context;try{context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Connexion requise.',code:error.code||null});}
 const params=new URLSearchParams(event.rawQuery||'');const symbol=(params.get('symbol')||'').toUpperCase();const interval=params.get('interval')||'5min';const requestedSize=Number(params.get('outputsize')||250);if(!Number.isInteger(requestedSize)||requestedSize<30)return json(400,{error:'Taille d’historique invalide.'});const outputsize=Math.min(500,Math.max(50,requestedSize));
 if(!ALLOWED.has(symbol)||!INTERVALS.has(interval))return json(400,{error:'Instrument ou intervalle non autorisé.'});
 const marketStatus=getMarketStatus(symbol);if(!marketStatus.tradable)return json(409,{error:'Marché fermé pour le week-end. Les nouvelles données et analyses sont suspendues jusqu’à la réouverture.',code:'MARKET_CLOSED',marketStatus});
 const clientIp=context.user.id;if(!rateAllowed(`market:${clientIp}`))return json(429,{error:'Limite de requêtes marché atteinte. Réessayez dans une minute.'});
 const key=process.env.TWELVEDATA_API_KEY;if(!key)return json(503,{error:'Flux de marché non configuré côté serveur.'});
 const cacheKey=`${symbol}:${interval}:${outputsize}`,cached=cache.get(cacheKey),cacheAge=cached?Date.now()-cached.at:Infinity;
 if(cached&&cacheAge<CACHE_FRESH_MS)return json(200,{...cached.value,cached:true,stale:false});
 const url=new URL('https://api.twelvedata.com/time_series');url.searchParams.set('symbol',symbol);url.searchParams.set('interval',interval);url.searchParams.set('outputsize',String(outputsize));url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');
 let lastError=null;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(9000)});const data=await response.json().catch(()=>({}));
   if(response.ok&&data.status!=='error'&&Array.isArray(data.values)){
    const candles=data.values.map(v=>({time:v.datetime,open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:v.volume==null?null:Number(v.volume)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).reverse();
    if(candles.length<30)throw Object.assign(new Error('Historique OHLC insuffisant.'),{retryable:false,count:candles.length});
    const value={symbol,interval,candles,timezone:data.meta?.exchange_timezone||data.meta?.timezone||null,fetchedAt:new Date().toISOString(),source:'Twelve Data',stale:false};cache.set(cacheKey,{at:Date.now(),value});return json(200,value);
   }
   const providerMessage=data.message||data.code||`Réponse fournisseur HTTP ${response.status}.`;
   const messageText=String(providerMessage);
   const effectiveStatus=Number(data.code)>=400?Number(data.code):(/quota|credits|api credits|rate limit|requests per minute/i.test(messageText)?429:response.status);
   const failure=providerFailure(effectiveStatus,providerMessage);
   lastError=Object.assign(new Error(failure.detail),{retryable:failure.retryable,status:effectiveStatus,failure});
   // Un quota 429 ou une clé refusée ne s'améliore pas avec une deuxième requête.
   if(!failure.retryable||effectiveStatus===429)break;
  }catch(error){lastError=error;if(error.retryable===false)break;}
  if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));
 }
 // Un cache périmé n'est jamais servi pour une erreur d'authentification ou de quota :
 // il pourrait masquer un problème de configuration ou faire croire à un prix frais.
 if(cached&&cacheAge<=CACHE_STALE_MAX_MS&&lastError?.failure?.retryable&&lastError?.status!==429){return json(200,{...cached.value,cached:true,stale:true,staleAgeSeconds:Math.floor(cacheAge/1000),providerWarning:lastError?.failure?.error||'Fournisseur temporairement indisponible.',providerCode:lastError?.failure?.code||'TWELVEDATA_UPSTREAM'});}
 const failure=lastError?.failure||{statusCode:502,code:'TWELVEDATA_NETWORK',retryable:true,error:'Flux de marché temporairement indisponible.',detail:lastError?.message||'Aucune réponse exploitable du fournisseur.'};
 console.error('[AUREVIA market-data]',JSON.stringify({symbol,interval,code:failure.code,status:lastError?.status||null,detail:failure.detail}));
 return json(failure.statusCode,{error:failure.error,detail:failure.detail,code:failure.code,retryable:failure.retryable});
}
