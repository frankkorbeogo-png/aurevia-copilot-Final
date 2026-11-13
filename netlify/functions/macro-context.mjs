import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
// DTWEXBGS est l'indice large du dollar (pas le DXY). Il reste séparé du DXY.
const SERIES={BROAD_USD_INDEX:'DTWEXBGS',NOMINAL_YIELD_10Y:'DGS10',REAL_YIELD_10Y:'DFII10',FED_FUNDS:'FEDFUNDS',CPI:'CPIAUCSL',UNEMPLOYMENT:'UNRATE'};
const INSTRUMENT_CURRENCIES={XAUUSD:['USD'],XAGUSD:['USD'],EURUSD:['EUR','USD'],GBPUSD:['GBP','USD'],USDJPY:['USD','JPY'],AUDUSD:['AUD','USD'],USDCAD:['USD','CAD'],USDCHF:['USD','CHF'],NZDUSD:['NZD','USD'],EURGBP:['EUR','GBP'],EURJPY:['EUR','JPY'],GBPJPY:['GBP','JPY'],BTCUSD:['USD'],ETHUSD:['USD']};
async function latestSeries(apiKey,id){
 const u=new URL('https://api.stlouisfed.org/fred/series/observations');
 u.searchParams.set('series_id',id);u.searchParams.set('api_key',apiKey);u.searchParams.set('file_type','json');u.searchParams.set('sort_order','desc');u.searchParams.set('limit','2');
 const r=await fetch(u,{signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw new Error(`FRED ${id}: HTTP ${r.status}`);
 const d=await r.json();if(d.error_message)throw new Error(d.error_message);
 const rows=(d.observations||[]).filter(x=>x.value!=='.'&&Number.isFinite(Number(x.value))).map(x=>({date:x.date,value:Number(x.value)}));
 if(!rows.length)throw new Error(`FRED ${id}: aucune observation exploitable`);
 const latest=rows[0],previous=rows[1]||null,ageDays=Math.max(0,Math.floor((Date.now()-Date.parse(`${latest.date}T00:00:00Z`))/86400000));
 const maxAgeDays=({DTWEXBGS:14,DGS10:7,DFII10:7,FEDFUNDS:45,CPIAUCSL:75,UNRATE:75})[id]||45;
 return {latest,previous,ageDays,maxAgeDays,freshness:ageDays<=maxAgeDays?'recent':'stale'};
}
async function fetchDxy(){
 const key=process.env.TWELVEDATA_API_KEY;
 if(!key)return {configured:false,source:'Twelve Data',notice:'TWELVEDATA_API_KEY absent.'};
 const u=new URL('https://api.twelvedata.com/quote');u.searchParams.set('symbol','DXY');u.searchParams.set('apikey',key);u.searchParams.set('timezone','UTC');
 const r=await fetch(u,{signal:AbortSignal.timeout(9000)});let d={};try{d=await r.json();}catch{}
 const price=Number(d.close??d.price);
 if(!r.ok||!Number.isFinite(price)||price<=0||d.status==='error'||d.code){return {configured:false,source:'Twelve Data',symbol:'DXY',providerStatus:d.code||r.status,notice:d.message||'Le fournisseur ne confirme pas le symbole DXY pour cette clé ou ce forfait.'};}
 const stamp=Number(d.last_quote_at??d.timestamp);const asOf=Number.isFinite(stamp)&&stamp>0?new Date(stamp*1000).toISOString():(d.datetime?new Date(`${d.datetime.replace(' ','T')}Z`).toISOString():null);
 const ageMinutes=asOf?Math.max(0,Math.floor((Date.now()-Date.parse(asOf))/60000)):null;
 const freshness=ageMinutes===null?'unknown':ageMinutes<=20?'recent':'stale';
 return {configured:true,symbol:'DXY',price,asOf,ageMinutes,freshness,source:'Twelve Data',realtime:false,exchange:d.exchange||null,currency:d.currency||null,change:Number.isFinite(Number(d.change))?Number(d.change):null,percentChange:Number.isFinite(Number(d.percent_change))?Number(d.percent_change):null,notice:freshness==='stale'?'Dernière cotation DXY ancienne : ne pas la traiter comme un cours actuel.':freshness==='unknown'?'Horodatage de cotation non fourni : fraîcheur non vérifiable.':'Dernière cotation horodatée fournie par Twelve Data; ce flux REST n’est pas un flux tick temps réel.'};
}
async function fetchCalendar(currencies){
 const unique=[...new Set((currencies||['USD']).filter(x=>/^[A-Z]{3}$/.test(x)))];
 const settled=await Promise.all(unique.map(async currency=>{
  const u=new URL('https://showmytrades.com/api/public/calendar/v1');
  u.searchParams.set('currency',currency);u.searchParams.set('impact','high,medium');u.searchParams.set('days','7');u.searchParams.set('format','json');
  const r=await fetch(u,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});
  if(!r.ok)throw new Error(`${currency}: HTTP ${r.status}`);
  const data=await r.json();if(!data||!Array.isArray(data.events))throw new Error(`${currency}: format invalide`);
  return {currency,data};
 }));
 const events=settled.flatMap(({currency,data})=>(data.events||[]).map(e=>{
  const timestamp=Number.isFinite(Number(e.ts))?Number(e.ts):null;
  const eventMs=timestamp!==null?timestamp*1000:Date.parse(e.time||'');
  const published=String(e.actual??'').trim()!=='';
  const phase=published?'published':Number.isFinite(eventMs)&&eventMs<Date.now()?'awaiting_result':'upcoming';
  return {id:e.id||null,timestamp,date:e.time||null,country:e.country||null,currency:e.currency||currency, event:e.title||'Événement économique',importance:e.impact||null,actual:e.actual??'',forecast:e.forecast??'',previous:e.previous??'',status:e.status||'scheduled',phase,confidence:e.confidence||null,movedFrom:e.moved_from||null,period:e.period||null};
 }).filter(e=>e.date&&e.event&&e.currency===currency));
 const seen=new Set();const deduped=events.filter(e=>{const key=e.id||`${e.currency}|${e.date}|${e.event}`;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 return {configured:true,source:'ShowMyTrades',currencies:unique,timezone:'UTC',events:deduped,asOf:new Date().toISOString(),notice:'Flux fondamental interne réservé à l’analyse IA ; il ne constitue pas le calendrier affiché dans l’interface. Exhaustivité et horaires dépendants du fournisseur. Les événements publiés doivent être confrontés à la réaction réelle des prix.'};
}

export async function handler(event){if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});try{const context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Session invalide.'});}
 const instrument=new URL(event.rawUrl||event.path||'https://aurevia.local/api/macro-context').searchParams.get('instrument')||'XAUUSD';const currencies=INSTRUMENT_CURRENCIES[instrument]||['USD'];const usdRelevant=currencies.includes('USD');const [dxy,calendar]=await Promise.all([usdRelevant?fetchDxy().catch(()=>({configured:false,source:'Twelve Data',notice:'DXY indisponible.'})):Promise.resolve({configured:false,applicable:false,source:'Twelve Data',notice:'DXY non utilisé pour cette paire sans USD.'}),fetchCalendar(currencies).catch(error=>({configured:false,source:'internal economic data provider',currencies,events:[],notice:`Calendrier fondamental indisponible : ${String(error?.message||error).slice(0,180)}`}))]);
 const key=process.env.FRED_API_KEY;let series={},fredConfigured=Boolean(key),fredNotice='';
 if(key&&usdRelevant){
  const entries=await Promise.all(Object.entries(SERIES).map(async([name,id])=>{
   try{return [name,{seriesId:id,...await latestSeries(key,id),available:true}];}
   catch(error){return [name,{seriesId:id,available:false,error:error.message||'Série indisponible.'}];}
  }));
  series=Object.fromEntries(entries);fredConfigured=Object.values(series).some(x=>x.available);
  const failed=Object.values(series).filter(x=>!x.available).length;
  if(failed)fredNotice=`${failed} série(s) FRED indisponible(s); les autres données restent utilisables.`;
 } else fredNotice=key?'Séries macroéconomiques américaines non sollicitées : aucune devise USD dans cet instrument.':'FRED_API_KEY absent.';
 const dates=Object.values(series).filter(x=>x.available).map(x=>x.latest.date).sort();
 const stale=Object.values(series).filter(x=>x.available&&x.freshness==='stale').length;
 return json(200,{configured:fredConfigured||dxy.configured||calendar.configured,instrument,currencies,source:'AUREVIA macro aggregator',asOf:new Date().toISOString(),dxy,broadUsdIndex:series.BROAD_USD_INDEX||null,series,calendar,fred:{configured:fredConfigured,source:'FRED',asOf:dates.at(-1)||null,availableSeries:Object.values(series).filter(x=>x.available).length,totalSeries:Object.keys(SERIES).length,staleSeries:stale,notice:fredNotice||'Séries historiques à fréquences et délais différents.'},notice:'Sources fondamentales internes, jamais affichées comme calendrier dans l’interface. Le DXY n’est jamais remplacé par le dollar large FRED. Les événements à venir servent d’avertissement ; après publication, les chiffres réels, prévisions et précédents sont confrontés à la réaction effective des prix. Une donnée absente ou périmée ne bloque jamais l’analyse technique et ne doit pas être inventée.'});}
