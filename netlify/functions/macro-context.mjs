import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
// DTWEXBGS est l'indice large du dollar (pas le DXY). Il reste séparé du DXY.
const SERIES={BROAD_USD_INDEX:'DTWEXBGS',NOMINAL_YIELD_10Y:'DGS10',REAL_YIELD_10Y:'DFII10',FED_FUNDS:'FEDFUNDS',CPI:'CPIAUCSL',UNEMPLOYMENT:'UNRATE'};
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
async function fetchCalendar(){
 const u=new URL('https://showmytrades.com/api/public/calendar/v1');
 u.searchParams.set('currency','USD');u.searchParams.set('impact','high,medium');u.searchParams.set('days','7');u.searchParams.set('format','json');
 const r=await fetch(u,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});
 if(!r.ok)return {configured:false,source:'ShowMyTrades',events:[],notice:`Calendrier économique indisponible (HTTP ${r.status}).`};
 const data=await r.json();if(!data||!Array.isArray(data.events))return {configured:false,source:'ShowMyTrades',events:[],notice:'Réponse du calendrier invalide.'};
 const events=data.events.map(e=>({id:e.id||null,timestamp:Number.isFinite(Number(e.ts))?Number(e.ts):null,date:e.time||null,country:'United States',currency:e.currency||'USD',event:e.title||'Événement économique',importance:e.impact||null,actual:e.actual??'',forecast:e.forecast??'',previous:e.previous??'',status:e.status||'scheduled',confidence:e.confidence||null,movedFrom:e.moved_from||null,period:e.period||null,source:'ShowMyTrades'})).filter(e=>e.date&&e.event&&e.currency==='USD');
 return {configured:true,source:'ShowMyTrades',timezone:'UTC',events,asOf:data.generated_at||data.server_time_iso||new Date().toISOString(),serverTime:data.server_time||null,attribution:data.attribution||{text:'Economic calendar by ShowMyTrades',url:'https://showmytrades.com/tools/economic-calendar'},notice:'Calendrier USD public, mis en cache par le fournisseur environ 15 minutes. Les dates peuvent être modifiées et l’exhaustivité n’est pas garantie. Une valeur Actual vide signifie que le résultat n’est pas encore publié.'};
}
export async function handler(event){if(event.httpMethod!=='GET')return json(405,{error:'Méthode non autorisée.'});try{const context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Session invalide.'});}
 const [dxy,calendar]=await Promise.all([fetchDxy().catch(()=>({configured:false,source:'Twelve Data',notice:'DXY indisponible.'})),fetchCalendar().catch(()=>({configured:false,source:'ShowMyTrades',events:[],notice:'Calendrier indisponible.'}))]);
 const key=process.env.FRED_API_KEY;let series={},fredConfigured=Boolean(key),fredNotice='';
 if(key){
  const entries=await Promise.all(Object.entries(SERIES).map(async([name,id])=>{
   try{return [name,{seriesId:id,...await latestSeries(key,id),available:true}];}
   catch(error){return [name,{seriesId:id,available:false,error:error.message||'Série indisponible.'}];}
  }));
  series=Object.fromEntries(entries);fredConfigured=Object.values(series).some(x=>x.available);
  const failed=Object.values(series).filter(x=>!x.available).length;
  if(failed)fredNotice=`${failed} série(s) FRED indisponible(s); les autres données restent utilisables.`;
 } else fredNotice='FRED_API_KEY absent.';
 const dates=Object.values(series).filter(x=>x.available).map(x=>x.latest.date).sort();
 const stale=Object.values(series).filter(x=>x.available&&x.freshness==='stale').length;
 return json(200,{configured:fredConfigured||dxy.configured||calendar.configured,source:'AUREVIA macro aggregator',asOf:new Date().toISOString(),dxy,broadUsdIndex:series.BROAD_USD_INDEX||null,series,calendar,fred:{configured:fredConfigured,source:'FRED',asOf:dates.at(-1)||null,availableSeries:Object.values(series).filter(x=>x.available).length,totalSeries:Object.keys(SERIES).length,staleSeries:stale,notice:fredNotice||'Séries historiques à fréquences et délais différents.'},notice:'Les sources sont séparées : le DXY n’est jamais remplacé par le dollar pondéré FRED. Chaque série FRED expose sa date, son ancienneté et son état de fraîcheur. Une donnée absente ou périmée doit diminuer la confiance; aucune donnée manquante ne sera inventée.'});}
