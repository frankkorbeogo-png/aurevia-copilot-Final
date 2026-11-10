const ALLOWED=new Set(['XAU/USD','XAG/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','BTC/USD','ETH/USD']);
const INTERVALS=new Set(['1min','5min','15min','30min','1h','4h','1day']);
const cache=new Map();
const rate=new Map();
function rateAllowed(key,limit=36){const now=Date.now(),item=rate.get(key);if(!item||now-item.start>60000){rate.set(key,{start:now,count:1});return true;}if(item.count>=limit)return false;item.count++;return true;}
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'same-origin'},body:JSON.stringify(body)});
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}};
 if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});
 const params=new URLSearchParams(event.rawQuery||'');const symbol=(params.get('symbol')||'').toUpperCase();const interval=params.get('interval')||'5min';const requestedSize=Number(params.get('outputsize')||250);if(!Number.isInteger(requestedSize)||requestedSize<30)return json(400,{error:'Taille d’historique invalide.'});const outputsize=Math.min(500,Math.max(50,requestedSize));
 if(!ALLOWED.has(symbol)||!INTERVALS.has(interval))return json(400,{error:'Instrument ou intervalle non autorisé.'});
 const clientIp=event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()||'unknown';if(!rateAllowed(`market:${clientIp}`))return json(429,{error:'Limite de requêtes marché atteinte. Réessayez dans une minute.'});
 const key=process.env.TWELVEDATA_API_KEY;if(!key)return json(503,{error:'Flux de marché non configuré côté serveur.'});
 const cacheKey=`${symbol}:${interval}:${outputsize}`,cached=cache.get(cacheKey);if(cached&&Date.now()-cached.at<15000)return json(200,{...cached.value,cached:true});
 try{
  const url=new URL('https://api.twelvedata.com/time_series');url.searchParams.set('symbol',symbol);url.searchParams.set('interval',interval);url.searchParams.set('outputsize',String(outputsize));url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok||data.status==='error'||!Array.isArray(data.values))return json(502,{error:data.message||'Réponse fournisseur indisponible.'});
  const candles=data.values.map(v=>({time:v.datetime,open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:v.volume==null?null:Number(v.volume)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).reverse();
  if(candles.length<30)return json(502,{error:'Historique OHLC insuffisant.',count:candles.length});
  const value={symbol,interval,candles,timezone:data.meta?.exchange_timezone||data.meta?.timezone||null,fetchedAt:new Date().toISOString(),source:'Twelve Data'};cache.set(cacheKey,{at:Date.now(),value});return json(200,value);
 }catch(error){return json(502,{error:'Impossible de récupérer les données de marché.',detail:error.name==='TimeoutError'?'Délai fournisseur dépassé.':undefined});}
}
