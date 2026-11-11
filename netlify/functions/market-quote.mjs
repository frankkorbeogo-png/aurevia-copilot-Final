const ALLOWED=new Set(['XAU/USD','XAG/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','BTC/USD','ETH/USD']);
const cache=new Map();
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'same-origin'},body:JSON.stringify(body)});
export async function handler(event){
 if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'same-origin','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}};
 if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});
 const symbol=(new URLSearchParams(event.rawQuery||'').get('symbol')||'').toUpperCase();
 if(!ALLOWED.has(symbol))return json(400,{error:'Instrument non autorisé.'});
 const key=process.env.TWELVEDATA_API_KEY;if(!key)return json(503,{error:'Flux Twelve Data non configuré côté serveur.'});
 const cached=cache.get(symbol);if(cached&&Date.now()-cached.at<30000)return json(200,{...cached.value,cached:true});
 try{
  const url=new URL('https://api.twelvedata.com/price');url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});const data=await response.json();const price=Number(data.price);
  if(!response.ok||data.status==='error'||!Number.isFinite(price))return json(502,{error:data.message||'Cours Twelve Data indisponible.'});
  const value={symbol,price,fetchedAt:new Date().toISOString(),source:'Twelve Data'};cache.set(symbol,{at:Date.now(),value});return json(200,value);
 }catch(error){return json(502,{error:error.name==='TimeoutError'?'Délai Twelve Data dépassé.':'Impossible de récupérer le cours Twelve Data.'});}
}
