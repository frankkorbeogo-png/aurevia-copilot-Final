import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
// DTWEXBGS est l'indice large du dollar (pas le DXY). Il reste séparé du DXY.
const SERIES={BROAD_USD_INDEX:'DTWEXBGS',NOMINAL_YIELD_10Y:'DGS10',REAL_YIELD_10Y:'DFII10',FED_FUNDS:'FEDFUNDS',CPI:'CPIAUCSL',UNEMPLOYMENT:'UNRATE'};
const INSTRUMENT_CURRENCIES={XAUUSD:['USD'],XAGUSD:['USD'],EURUSD:['EUR','USD'],GBPUSD:['GBP','USD'],USDJPY:['USD','JPY'],AUDUSD:['AUD','USD'],USDCAD:['USD','CAD'],USDCHF:['USD','CHF'],NZDUSD:['NZD','USD'],EURGBP:['EUR','GBP'],EURJPY:['EUR','JPY'],GBPJPY:['GBP','JPY'],EURAUD:['EUR','AUD'],EURCHF:['EUR','CHF'],GBPAUD:['GBP','AUD'],AUDJPY:['AUD','JPY'],BTCUSD:['USD'],ETHUSD:['USD'],SOLUSD:['USD'],XRPUSD:['USD'],AAPL:['USD'],MSFT:['USD'],NVDA:['USD'],TSLA:['USD'],AMZN:['USD']};
async function latestSeries(apiKey,id){
 const u=new URL('https://api.stlouisfed.org/fred/series/observations');
 u.searchParams.set('series_id',id);u.searchParams.set('api_key',apiKey);u.searchParams.set('file_type','json');u.searchParams.set('sort_order','desc');u.searchParams.set('limit','2');
 const r=await fetch(u,{signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw new Error(`FRED ${id}: HTTP ${r.status}`);
 const d=await r.json();if(d.error_message)throw new Error(d.error_message);
 const rows=(d.observations||[]).filter(x=>x.value!=='.'&&Number.isFinite(Number(x.value))).map(x=>({date:x.date,value:Number(x.value)}));
 if(!rows.length)throw new Error(`FRED ${id}: aucune observation exploitable`);
 const latest=rows[0],previous=rows[1]||null,ageDays=Math.floor((Date.now()-Date.parse(`${latest.date}T00:00:00Z`))/86400000);
 const maxAgeDays=({DTWEXBGS:14,DGS10:7,DFII10:7,FEDFUNDS:45,CPIAUCSL:75,UNRATE:75})[id]||45;
 return {latest,previous,ageDays,maxAgeDays,freshness:ageDays<0?'future':ageDays<=maxAgeDays?'recent':'stale'};
}
async function fetchDxy(){
 const key=process.env.TWELVEDATA_API_KEY;
 if(!key)return {configured:false,source:'Twelve Data',notice:'TWELVEDATA_API_KEY absent.'};
 const u=new URL('https://api.twelvedata.com/quote');u.searchParams.set('symbol','DXY');u.searchParams.set('apikey',key);u.searchParams.set('interval','1min');u.searchParams.set('timezone','UTC');
 const r=await fetch(u,{signal:AbortSignal.timeout(9000)});let d={};try{d=await r.json();}catch{}
 const price=Number(d.close??d.price);
 if(!r.ok||!Number.isFinite(price)||price<=0||d.status==='error'||d.code){return {configured:false,source:'Twelve Data',symbol:'DXY',providerStatus:d.code||r.status,notice:d.message||'Le fournisseur ne confirme pas le symbole DXY pour cette clé ou ce forfait.'};}
 // Quote.datetime/timestamp indiquent l'ouverture de la bougie ; seule last_quote_at date la dernière cotation.
 const stamp=Number(d.last_quote_at);const asOf=Number.isFinite(stamp)&&stamp>0?new Date(stamp*1000).toISOString():null;
 const ageMinutes=asOf?Math.floor((Date.now()-Date.parse(asOf))/60000):null;
 const freshness=ageMinutes===null?'unknown':ageMinutes < -5?'future':ageMinutes<=20?'recent':'stale';
 if(freshness!=='recent')return {configured:false,symbol:'DXY',price:null,asOf,ageMinutes,freshness,source:'Twelve Data',realtime:false,notice:freshness==='future'?'Horodatage DXY situé dans le futur : la valeur est exclue du contexte transmis à l’IA.':freshness==='stale'?'Cotation DXY trop ancienne : la valeur est exclue du contexte transmis à l’IA.':'Horodatage de dernière cotation DXY absent : fraîcheur non vérifiable, valeur exclue du contexte IA.'};
 return {configured:true,symbol:'DXY',price,asOf,ageMinutes,freshness,source:'Twelve Data',realtime:false,exchange:d.exchange||null,currency:d.currency||null,change:Number.isFinite(Number(d.change))?Number(d.change):null,percentChange:Number.isFinite(Number(d.percent_change))?Number(d.percent_change):null,notice:freshness==='stale'?'Dernière cotation DXY ancienne : ne pas la traiter comme un cours actuel.':freshness==='unknown'?'Horodatage de cotation non fourni : fraîcheur non vérifiable.':'Dernière cotation horodatée fournie par Twelve Data; ce flux REST n’est pas un flux tick temps réel.'};
}
async function fetchGlobalNews(){
 const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!base||!key)return {configured:false,source:'GDELT DOC 2.0',articles:[],notice:'Accès serveur Supabase non configuré.'};
 const since=new Date(Date.now()-72*60*60*1000).toISOString();
 const url=new URL(base+'/rest/v1/global_news_events');
 url.searchParams.set('select','title,source_url,source_domain,source_country,source_language,seen_at,category,tone,source_provider');
 url.searchParams.set('seen_at','gte.'+since);url.searchParams.set('order','seen_at.desc');url.searchParams.set('limit','12');
 const response=await fetch(url,{headers:{apikey:key,authorization:'Bearer '+key,accept:'application/json'},signal:AbortSignal.timeout(7000)});
 if(!response.ok){if(response.status===404)return {configured:false,source:'GDELT DOC 2.0',articles:[],notice:'La migration des actualités internationales n’est pas encore appliquée.'};throw new Error('Supabase global news HTTP '+response.status);}
 const rows=await response.json();
 return {configured:true,source:'GDELT DOC 2.0',articles:(Array.isArray(rows)?rows:[]).map(x=>({title:x.title,url:x.source_url,domain:x.source_domain,country:x.source_country,language:x.source_language,observedAt:x.seen_at,observationSource:'GDELT first-seen time, not publisher publication time',category:x.category,tone:x.tone,provider:x.source_provider})),asOf:new Date().toISOString(),notice:'Titres et liens de couverture macroéconomique/géopolitique issus de GDELT. Les dates indiquent la première observation par GDELT, pas la date de publication du média. Les articles sont des sources à vérifier, pas des faits confirmés ni des signaux de trading.'};
}
async function fetchEconomicReleaseSchedule(){
 const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!base||!key)return {configured:false,source:'FRED release calendar',events:[],notice:'Accès serveur non configuré.'};
 const now=new Date(),end=new Date(Date.now()+14*86400000);
 const url=new URL(base+'/rest/v1/economic_release_events');
 url.searchParams.set('select','event_name,release_date,scheduled_at,source_timezone,currency,impact,source_url,time_basis');
 url.searchParams.set('and','(scheduled_at.gte.'+now.toISOString()+',scheduled_at.lte.'+end.toISOString()+')');
 url.searchParams.set('order','scheduled_at.asc');url.searchParams.set('limit','20');
 const response=await fetch(url,{headers:{apikey:key,authorization:'Bearer '+key,accept:'application/json'},signal:AbortSignal.timeout(7000)});
 if(!response.ok){if(response.status===404)return {configured:false,source:'FRED release calendar',events:[],notice:'La migration du calendrier économique n’est pas encore appliquée.'};throw new Error('Supabase economic release schedule HTTP '+response.status);}
 const rows=await response.json();
 return {configured:true,source:'FRED release calendar',events:(Array.isArray(rows)?rows:[]).map(x=>({event:x.event_name,date:x.release_date,scheduledAt:x.scheduled_at,timezone:x.source_timezone,currency:x.currency,impact:x.impact,sourceUrl:x.source_url,timeBasis:x.time_basis})),asOf:new Date().toISOString(),notice:'Dates futures publiées par FRED pour six publications américaines majeures. Les heures sont les horaires habituels de publication des organismes, pas un horaire garanti ; vérifier le lien officiel avant la publication.'};
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
 const instrument=new URL(event.rawUrl||event.path||'https://aurevia.local/api/macro-context').searchParams.get('instrument')||'XAUUSD';const currencies=INSTRUMENT_CURRENCIES[instrument]||['USD'];const usdRelevant=currencies.includes('USD');const [dxy,calendar,globalNews,economicReleaseSchedule]=await Promise.all([usdRelevant?fetchDxy().catch(()=>({configured:false,source:'Twelve Data',notice:'DXY indisponible.'})):Promise.resolve({configured:false,applicable:false,source:'Twelve Data',notice:'DXY non utilisé pour cette paire sans USD.'}),fetchCalendar(currencies).catch(error=>({configured:false,source:'internal economic data provider',currencies,events:[],notice:`Calendrier fondamental indisponible : ${String(error?.message||error).slice(0,180)}`})),fetchGlobalNews().catch(error=>({configured:false,source:'GDELT DOC 2.0',articles:[],notice:`Actualités internationales indisponibles : ${String(error?.message||error).slice(0,180)}`})),fetchEconomicReleaseSchedule().catch(error=>({configured:false,source:'FRED release calendar',events:[],notice:`Calendrier des publications indisponible : ${String(error?.message||error).slice(0,180)}`}))]);
 const key=process.env.FRED_API_KEY;let series={},fredConfigured=Boolean(key),fredNotice='';
 if(key&&usdRelevant){
  const entries=await Promise.all(Object.entries(SERIES).map(async([name,id])=>{
   try{
    const result=await latestSeries(key,id),unusable=result.freshness==='future'||result.freshness==='stale';
    return [name,{seriesId:id,...result,available:!unusable,...(unusable?{error:result.freshness==='future'?'Observation FRED datée dans le futur : valeur exclue du contexte IA.':'Observation FRED trop ancienne : valeur exclue du contexte IA.'}:{})}];
   }catch(error){return [name,{seriesId:id,available:false,error:error.message||'Série indisponible.'}];}
  }));
  series=Object.fromEntries(entries);fredConfigured=Object.values(series).some(x=>x.available);
  const failed=Object.values(series).filter(x=>!x.available).length;
  const futureSeries=Object.values(series).filter(x=>x.freshness==='future').length;
  if(failed||futureSeries)fredNotice=`${failed} série(s) FRED indisponible(s), dont ${futureSeries} datée(s) dans le futur; les valeurs futures ou périmées sont exclues du contexte IA.`;
 } else fredNotice=key?'Séries macroéconomiques américaines non sollicitées : aucune devise USD dans cet instrument.':'FRED_API_KEY absent.';
 const dates=Object.values(series).filter(x=>x.available).map(x=>x.latest.date).sort();
 const stale=Object.values(series).filter(x=>x.available&&x.freshness==='stale').length;
 return json(200,{configured:fredConfigured||dxy.configured||calendar.configured||globalNews.configured||economicReleaseSchedule.configured,instrument,currencies,source:'AUREVIA macro aggregator',asOf:new Date().toISOString(),dxy,globalNews,economicReleaseSchedule,broadUsdIndex:series.BROAD_USD_INDEX||null,series,calendar,fred:{configured:fredConfigured,source:'FRED',asOf:dates.at(-1)||null,availableSeries:Object.values(series).filter(x=>x.available).length,totalSeries:Object.keys(SERIES).length,staleSeries:stale,futureSeries:Object.values(series).filter(x=>x.freshness==='future').length,notice:fredNotice||'Séries historiques à fréquences et délais différents.'},notice:'Sources fondamentales internes, jamais affichées comme calendrier dans l’interface. Le DXY n’est jamais remplacé par le dollar large FRED. Les événements à venir servent d’avertissement ; après publication, les chiffres réels, prévisions et précédents sont confrontés à la réaction effective des prix. Une donnée absente ou périmée ne bloque jamais l’analyse technique et ne doit pas être inventée.'});}
