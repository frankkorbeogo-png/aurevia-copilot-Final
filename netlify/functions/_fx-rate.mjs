const CACHE=new Map();
export function inferQuoteCurrency(instrument){
 const symbol=String(instrument||'').trim().toUpperCase().replace(/\s+/g,'');
 if(symbol.includes('/')){const q=symbol.split('/').at(-1);return /^[A-Z]{3}$/.test(q)?q:null;}
 const map={US30:'USD',NAS100:'USD',SPX500:'USD',GER40:'EUR',UK100:'GBP',JPN225:'JPY',USOIL:'USD',UKOIL:'USD',AAPL:'USD',MSFT:'USD',NVDA:'USD',TSLA:'USD',AMZN:'USD',BTCUSD:'USD',ETHUSD:'USD',SOLUSD:'USD',XRPUSD:'USD'};
 return map[symbol]||(/^[A-Z]{6}$/.test(symbol)?symbol.slice(3):null);
}
export async function getFxSnapshot(from,to){
 from=String(from||'').toUpperCase();to=String(to||'').toUpperCase();
 if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to))throw new Error('Devise de cotation ou devise du compte non reconnue.');
 if(from===to)return {from,to,rate:1,fetchedAt:new Date().toISOString(),source:'AUREVIA · parité identique'};
 const cacheKey=`${from}/${to}`,cached=CACHE.get(cacheKey);if(cached&&Date.now()-cached.at<60000)return {...cached.value,cached:true};
 const key=process.env.TWELVEDATA_API_KEY;if(!key)throw new Error('Conversion indisponible : fournisseur de taux non configuré.');
 async function request(pair){const url=new URL('https://api.twelvedata.com/exchange_rate');url.searchParams.set('symbol',pair);url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');const response=await fetch(url,{signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>({}));const rate=Number(data.rate);if(!response.ok||data.status==='error'||!Number.isFinite(rate)||rate<=0)throw new Error(data.message||`Taux ${pair} indisponible.`);return {rate, timestamp:data.timestamp||data.datetime||null};}
 const asIso=value=>{if(!value)return new Date().toISOString();const n=Number(value);const d=Number.isFinite(n)&&n>1000000000?new Date(n*1000):new Date(value);return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();};
 let value;try{const direct=await request(`${from}/${to}`);value={from,to,rate:direct.rate,fetchedAt:asIso(direct.timestamp),source:'Twelve Data Exchange Rate'};}catch(first){try{const inverse=await request(`${to}/${from}`);value={from,to,rate:1/inverse.rate,fetchedAt:asIso(inverse.timestamp),source:'Twelve Data Exchange Rate · taux inverse'};}catch(second){throw new Error(`Conversion ${from} → ${to} indisponible : ${second.message||first.message}`);}}
 CACHE.set(cacheKey,{at:Date.now(),value});return value;
}
