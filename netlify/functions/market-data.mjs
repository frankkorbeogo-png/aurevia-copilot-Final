import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
import {getMarketStatus} from '../../market-hours.js';
import {MARKET_PROVIDER_SYMBOLS} from '../../market-catalog.js';
const ALLOWED=new Set(MARKET_PROVIDER_SYMBOLS);
const INTERVALS=new Set(['1min','5min','15min','30min','1h','4h','1day']);
// Les bougies clôturées changent à la cadence de leur unité : un cache uniforme d'une minute
// dépense inutilement des crédits sur M30/H1/H4.
const CACHE_TTL_MS={'1min':15000,'5min':45000,'15min':4*60000,'30min':8*60000,'1h':15*60000,'4h':45*60000,'1day':4*60*60000};
const CACHE_STALE_MAX_MS=30*60*1000;
const cache=new Map(),inFlight=new Map(),quotaBlockedUntil=new Map(),rate=new Map();
function rateAllowed(key,limit=36){const now=Date.now(),item=rate.get(key);if(!item||now-item.start>60000){rate.set(key,{start:now,count:1});return true;}if(item.count>=limit)return false;item.count++;return true;}
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'same-origin'},body:JSON.stringify(body)});
function providerFailure(status,message){const normalized=String(message||'').slice(0,500);if(status===401||status===403)return {statusCode:502,code:'TWELVEDATA_AUTH_ERROR',retryable:false,error:'Le fournisseur de données refuse la clé API ou son accès.',detail:`Twelve Data HTTP ${status}: ${normalized}`};if(status===429)return {statusCode:429,code:'TWELVEDATA_QUOTA',retryable:true,error:'Quota Twelve Data atteint. AUREVIA suspend les nouveaux appels pendant 60 secondes.',detail:`Twelve Data HTTP ${status}: ${normalized}`};if(status>=500)return {statusCode:503,code:'TWELVEDATA_UPSTREAM',retryable:true,error:'Twelve Data rencontre une indisponibilité temporaire.',detail:`Twelve Data HTTP ${status}: ${normalized}`};return {statusCode:502,code:'TWELVEDATA_RESPONSE',retryable:false,error:'Twelve Data a retourné une réponse inexploitable.',detail:`Twelve Data HTTP ${status}: ${normalized}`};}
async function fetchProvider(symbol,interval,outputsize,key){
 const url=new URL('https://api.twelvedata.com/time_series');url.searchParams.set('symbol',symbol);url.searchParams.set('interval',interval);url.searchParams.set('outputsize',String(outputsize));url.searchParams.set('timezone','UTC');url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');
 let response,data;
 try{response=await fetch(url,{signal:AbortSignal.timeout(9000)});data=await response.json().catch(()=>({}));}
 catch(error){return {failure:{statusCode:503,code:'TWELVEDATA_NETWORK',retryable:true,error:'Flux de marché temporairement indisponible.',detail:String(error.message||error).slice(0,500)}};}
 if(!response.ok||data.status==='error'||!Array.isArray(data.values)){
  const message=data.message||data.code||`Réponse fournisseur HTTP ${response.status}.`;
  const status=Number(data.code)>=400?Number(data.code):(/quota|credits|api credits|rate limit|requests per minute/i.test(String(message))?429:response.status);
  return {failure:providerFailure(status,message)};
 }
 const candles=data.values.map(v=>({time:v.datetime,open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:v.volume==null?null:Number(v.volume)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).reverse();
 if(candles.length<30)return {failure:{statusCode:502,code:'TWELVEDATA_HISTORY_SHORT',retryable:false,error:'Historique OHLC insuffisant.',detail:`Seulement ${candles.length} bougies valides reçues.`}};
 const value={symbol,interval,candles,timezone:'UTC',exchangeTimezone:data.meta?.exchange_timezone||null,fetchedAt:new Date().toISOString(),source:'Twelve Data',stale:false};
 return {value};
}
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}};
 if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});
 let context;try{context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Connexion requise.',code:error.code||null});}
 const params=new URLSearchParams(event.rawQuery||'');const symbol=(params.get('symbol')||'').toUpperCase();const interval=params.get('interval')||'5min';const requestedSize=Number(params.get('outputsize')||250);if(!Number.isInteger(requestedSize)||requestedSize<30)return json(400,{error:'Taille d’historique invalide.'});const outputsize=Math.min(500,Math.max(50,requestedSize));
 if(!ALLOWED.has(symbol)||!INTERVALS.has(interval))return json(400,{error:'Instrument ou intervalle non autorisé.'});
 const marketStatus=getMarketStatus(symbol);if(!marketStatus.tradable)return json(409,{error:marketStatus.reason||'Marché fermé. Les nouvelles données et analyses sont suspendues jusqu’à la réouverture.',code:'MARKET_CLOSED',marketStatus});
 const cacheKey=`${symbol}:${interval}:${outputsize}`,cached=cache.get(cacheKey),now=Date.now(),cacheAge=cached?now-cached.at:Infinity;
 const ttl=CACHE_TTL_MS[interval]||60000;
 if(cached&&cacheAge<ttl)return json(200,{...cached.value,cached:true,stale:false,cacheAgeSeconds:Math.floor(cacheAge/1000)});
 const key=process.env.TWELVEDATA_API_KEY;if(!key)return json(503,{error:'Flux de marché non configuré côté serveur.'});
 const blockedUntil=quotaBlockedUntil.get(key)||0;
 if(now<blockedUntil){
  if(cached&&cacheAge<=CACHE_STALE_MAX_MS)return json(200,{...cached.value,cached:true,stale:true,staleAgeSeconds:Math.floor(cacheAge/1000),providerCode:'TWELVEDATA_QUOTA',providerWarning:'Quota Twelve Data temporairement bloqué. Ces données sont affichées à titre de diagnostic uniquement et ne peuvent produire aucun signal.'});
  return json(429,{error:'Quota Twelve Data temporairement bloqué. Aucun nouvel appel fournisseur ne sera tenté avant la fin de la temporisation.',code:'TWELVEDATA_QUOTA',retryAfterSeconds:Math.ceil((blockedUntil-now)/1000),retryable:true});
 }
 if(!rateAllowed(`market:${context.user.id}`))return json(429,{error:'Limite de requêtes marché atteinte. Réessayez dans une minute.',code:'AUREVIA_RATE_LIMIT'});
 if(inFlight.has(cacheKey))return inFlight.get(cacheKey);
 const task=(async()=>{
  const result=await fetchProvider(symbol,interval,outputsize,key);
  if(result.value){cache.set(cacheKey,{at:Date.now(),value:result.value});return json(200,{...result.value,cached:false,stale:false});}
  const failure=result.failure;
  if(failure.code==='TWELVEDATA_QUOTA')quotaBlockedUntil.set(key,Date.now()+60000);
  // Le dernier snapshot peut être consulté pour diagnostic, jamais comme donnée fraîche.
  if(cached&&Date.now()-cached.at<=CACHE_STALE_MAX_MS&&failure.retryable)return json(200,{...cached.value,cached:true,stale:true,staleAgeSeconds:Math.floor((Date.now()-cached.at)/1000),providerCode:failure.code,providerWarning:failure.error});
  console.error('[AUREVIA market-data]',JSON.stringify({symbol,interval,code:failure.code,status:failure.statusCode,detail:failure.detail}));
  return json(failure.statusCode,{error:failure.error,detail:failure.detail,code:failure.code,retryable:failure.retryable,retryAfterSeconds:failure.code==='TWELVEDATA_QUOTA'?60:undefined});
 })();
 inFlight.set(cacheKey,task);try{return await task;}finally{inFlight.delete(cacheKey);}
}
