import crypto from 'node:crypto';

const SOURCE='GDELT DOC 2.0';
const QUERY='("central bank" OR "interest rate" OR inflation OR CPI OR GDP OR unemployment OR sanctions OR tariff OR tariffs OR war OR conflict OR ceasefire OR "oil prices" OR OPEC OR energy crisis OR "trade restrictions")';
const RELEASES=[
 {id:10,name:'US Consumer Price Index (CPI)',hour:8,minute:30,url:'https://www.bls.gov/cpi/'},
 {id:50,name:'US Employment Situation / NFP',hour:8,minute:30,url:'https://www.bls.gov/news.release/empsit.htm'},
 {id:46,name:'US Producer Price Index (PPI)',hour:8,minute:30,url:'https://www.bls.gov/ppi/'},
 {id:53,name:'US Gross Domestic Product (GDP)',hour:8,minute:30,url:'https://www.bea.gov/data/gdp/gross-domestic-product'},
 {id:9,name:'US Advance Retail Sales',hour:8,minute:30,url:'https://www.census.gov/retail/index.html'},
 {id:101,name:'FOMC monetary policy statement',hour:14,minute:0,url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'}
];
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
const env=name=>(process.env[name]||'').trim();
async function rest(path,{method='GET',body,prefer}={}){
 const r=await fetch(env('SUPABASE_URL').replace(/\/$/, '')+'/rest/v1/'+path,{
  method,headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'content-type':'application/json',...(prefer?{prefer}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const raw=await r.text();if(!r.ok)throw new Error('Supabase '+r.status+': '+raw.slice(0,240));return raw?JSON.parse(raw):null;
}
function parseDate(value){
 const raw=String(value||'').trim();
 if(/^\d{8}T\d{6}Z$/.test(raw))return new Date(raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6Z')).toISOString();
 const n=Date.parse(raw);return Number.isFinite(n)?new Date(n).toISOString():null;
}
function normalizeArticle(article){
 const url=String(article.url||'').trim(),title=String(article.title||'').replace(/\s+/g,' ').trim();
 let parsed;try{parsed=new URL(url);}catch{return null;}
 if(!['https:','http:'].includes(parsed.protocol)||!title||title.length>500)return null;
 const seenAt=parseDate(article.seendate||article.datetime||article.date);
 const publishedAt=parseDate(article.published_at||article.publishdate||article.pubdate);
 if(!seenAt||Date.now()-Date.parse(seenAt)>100*60*1000||Date.parse(seenAt)>Date.now()+5*60*1000)return null;
 if(publishedAt&&(Date.parse(publishedAt)>Date.now()+5*60*1000||Date.now()-Date.parse(publishedAt)>30*86400000))return null;
 const externalId=crypto.createHash('sha256').update(url).digest('hex');
 const tone=Number(article.tone);
 return {external_id:externalId,title,source_url:url,source_domain:parsed.hostname.replace(/^www\./,''),source_country:String(article.sourcecountry||'').slice(0,80),source_language:String(article.language||'').slice(0,40),published_at:publishedAt,seen_at:seenAt,category:'macro_geopolitics',tone:Number.isFinite(tone)?tone:null,source_provider:SOURCE};
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function gdeltRetryDelay(response){
 const raw=String(response.headers.get('retry-after')||'').trim(),seconds=Number(raw),date=Date.parse(raw);
 const requested=Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):5000;
 return Math.max(5000,requested);
}
async function fetchArticles(){
 const url=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
 url.searchParams.set('query',QUERY);url.searchParams.set('mode','ArtList');url.searchParams.set('format','json');
 url.searchParams.set('maxrecords','75');url.searchParams.set('timespan','90min');url.searchParams.set('sort','DateDesc');
 const headers={accept:'application/json','user-agent':'AUREVIA-COPILOT/1.0 (global macro news; https://github.com/frankkorbeogo-png/aurevia-copilot-Final)'};
 let response;
 for(let attempt=0;attempt<2;attempt++){
  try{
   response=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
  }catch(error){
   if(attempt===0){console.warn('[AUREVIA GDELT] transient network error; retrying once',String(error.message||error).slice(0,180));await wait(1500);continue;}
   throw error;
  }
  if(response.status===429&&attempt===0){
   const delay=gdeltRetryDelay(response);await response.text().catch(()=>{});console.warn('[AUREVIA GDELT] rate limited; retrying after '+delay+'ms');await wait(delay);continue;
  }
  if(response.status>=500&&attempt===0){
   await response.text().catch(()=>{});console.warn('[AUREVIA GDELT] upstream HTTP '+response.status+'; retrying once');await wait(1500);continue;
  }
  break;
 }
 if(!response?.ok)throw new Error('GDELT HTTP '+(response?.status||'unavailable'));
 const type=response.headers.get('content-type')||'';if(!type.toLowerCase().includes('json'))throw new Error('GDELT a retourné un contenu non JSON.');
 const data=await response.json();const articles=Array.isArray(data.articles)?data.articles:[];
 return articles.map(normalizeArticle).filter(Boolean);
}
function dateInZone(date,zone){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}`;
}
function addDaysToIsoDate(value,days){
 const [year,month,day]=value.split('-').map(Number);
 return new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10);
}
export function getFredDateRange(now=new Date()){
 const today=dateInZone(now,'America/New_York');
 return {today,end:addDaysToIsoDate(today,14)};
}
function zonedTimeToUtc(date,hour,minute,zone='America/New_York'){
 const [year,month,day]=date.split('-').map(Number);const target=Date.UTC(year,month-1,day,hour,minute);let guess=target;
 for(let i=0;i<4;i++){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
  const p=Object.fromEntries(parts.map(x=>[x.type,Number(x.value)]));
  guess+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
 }
 return new Date(guess).toISOString();
}
async function syncEconomicCalendar(){
 const key=env('FRED_API_KEY');if(!key)return {status:'not_configured',synced:0,notice:'FRED_API_KEY absent : calendrier des publications futures non synchronisé.'};
 const state=await rest('economic_release_sync_state?id=eq.global&select=last_synced_at&limit=1');
 if(state?.[0]?.last_synced_at&&Date.now()-Date.parse(state[0].last_synced_at)<6*60*60*1000)return {status:'fresh_cache',synced:0};
 const {today,end}=getFredDateRange(new Date());
 const results=await Promise.all(RELEASES.map(async release=>{
  const url=new URL('https://api.stlouisfed.org/fred/release/dates');
  url.searchParams.set('release_id',String(release.id));url.searchParams.set('api_key',key);url.searchParams.set('file_type','json');
  url.searchParams.set('realtime_start',today);url.searchParams.set('realtime_end',end);url.searchParams.set('include_release_dates_with_no_data','true');url.searchParams.set('sort_order','asc');
  const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw new Error('FRED release '+release.id+' HTTP '+response.status);
  const data=await response.json();if(data.error_message)throw new Error(data.error_message);
  return (Array.isArray(data.release_dates)?data.release_dates:[]).map(row=>{
   const date=String(row.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
   const scheduledAt=zonedTimeToUtc(date,release.hour,release.minute);
   if(Date.parse(scheduledAt)<Date.now()-60*60*1000||Date.parse(scheduledAt)>Date.now()+15*86400000)return null;
   return {external_id:'FRED-'+release.id+'-'+date,release_id:release.id,event_name:release.name,release_date:date,scheduled_at:scheduledAt,source_timezone:'America/New_York',currency:'USD',impact:'high',source_url:release.url,source_provider:'FRED release calendar',time_basis:'standard_release_time'};
  }).filter(Boolean);
 }));
 const events=results.flat();
 if(events.length)await rest('economic_release_events?on_conflict=external_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:events.map(x=>({...x,is_active:true}))});
 const now=new Date(),horizon=new Date(now.getTime()+15*86400000);const current=await rest('economic_release_events?select=id,external_id,release_id,scheduled_at,is_active,telegram_broadcast_started_at&scheduled_at=gte.'+encodeURIComponent(now.toISOString())+'&scheduled_at=lte.'+encodeURIComponent(horizon.toISOString())+'&is_active=eq.true&release_id=in.('+RELEASES.map(x=>x.id).join(',')+')&limit=500');
 const live=new Set(events.map(x=>x.external_id));let deactivated=0;
 for(const row of (Array.isArray(current)?current:[])){
  if(!live.has(row.external_id)){
   await rest('economic_release_events?id=eq.'+encodeURIComponent(row.id),{method:'PATCH',body:{is_active:false}});
   deactivated++;
  }
 }
 await rest('economic_release_sync_state?on_conflict=id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{id:'global',last_synced_at:new Date().toISOString(),source_provider:'FRED release calendar'}});
 return {status:'synced',synced:events.length,deactivated,source:'FRED release calendar'};
}
async function broadcastToSubscribers(eventType,event,message,eventTable){
 const token=env('TELEGRAM_BOT_TOKEN');if(!token)return {status:'not_configured',sent:0,failed:0};
 await rest(eventTable+'?id=eq.'+encodeURIComponent(event.id),{method:'PATCH',body:{telegram_broadcast_started_at:event.telegram_broadcast_started_at||new Date().toISOString()}});
 const recipients=await rest('telegram_connections?select=user_id,chat_id&notify_economic_announcements=eq.true&chat_id=not.is.null&limit=5000');
 const chats=[...new Set((Array.isArray(recipients)?recipients:[]).filter(x=>x.user_id&&x.chat_id).map(x=>String(x.chat_id)))];
 const deliveries=chats.map(chat_id=>({event_type:eventType,event_id:event.id,chat_id,status:'pending'}));
 if(deliveries.length)await rest('telegram_event_deliveries?on_conflict=event_type,event_id,chat_id',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:deliveries});
 const pending=await rest('telegram_event_deliveries?select=id,chat_id,attempts,status,claimed_at&event_type=eq.'+eventType+'&event_id=eq.'+encodeURIComponent(event.id)+'&or=(status.in.(pending,failed),and(status.eq.sending,claimed_at.lt.'+encodeURIComponent(new Date(Date.now()-10*60*1000).toISOString())+'))&attempts=lt.5&limit=5000');
 let sent=0,failed=0;const errors=[];
 for(const item of (Array.isArray(pending)?pending:[])){
  const claimed=await rest('telegram_event_deliveries?id=eq.'+encodeURIComponent(item.id)+'&or=(status.in.(pending,failed),and(status.eq.sending,claimed_at.lt.'+encodeURIComponent(new Date(Date.now()-10*60*1000).toISOString())+'))&attempts=lt.5&select=id,attempts',{
   method:'PATCH',prefer:'return=representation',body:{status:'sending',attempts:Number(item.attempts||0)+1,claimed_at:new Date().toISOString()}
  });
  if(!Array.isArray(claimed)||!claimed.length)continue;
  try{
   const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:item.chat_id,text:message,disable_web_page_preview:true}),signal:AbortSignal.timeout(9000)});
   const result=await r.json().catch(()=>null);if(!r.ok||!result?.ok)throw new Error(result?.description||'Telegram HTTP '+r.status);
   await rest('telegram_event_deliveries?id=eq.'+encodeURIComponent(item.id),{method:'PATCH',body:{status:'sent',sent_at:new Date().toISOString(),last_error:null}});
   sent++;
  }catch(error){
   const attempts=Number(claimed[0].attempts||0),terminal=attempts>=5;
   await rest('telegram_event_deliveries?id=eq.'+encodeURIComponent(item.id),{method:'PATCH',body:{status:terminal?'failed':'pending',last_error:String(error.message||error).slice(0,240)}});
   failed++;if(errors.length<5)errors.push(String(error.message||error).slice(0,160));
  }
 }
 const all=await rest('telegram_event_deliveries?select=status,attempts&event_type=eq.'+eventType+'&event_id=eq.'+encodeURIComponent(event.id)+'&limit=5000');
 const rows=Array.isArray(all)?all:[],terminalFailed=rows.filter(x=>x.status==='failed'&&Number(x.attempts)>=5).length;
 const done=rows.every(x=>x.status==='sent'||(x.status==='failed'&&Number(x.attempts)>=5));
 const result={status:done?(terminalFailed?'completed_with_failures':'sent'):(failed?'retry_pending':'in_progress'),sent:rows.filter(x=>x.status==='sent').length,failed:terminalFailed,pending:rows.filter(x=>x.status!=='sent'&&!(x.status==='failed'&&Number(x.attempts)>=5)).length,errors};
 await rest(eventTable+'?id=eq.'+encodeURIComponent(event.id),{method:'PATCH',body:{telegram_broadcast_started_at:event.telegram_broadcast_started_at||new Date().toISOString(),...(done?{telegram_broadcast_completed_at:new Date().toISOString()}:{}),telegram_broadcast_result:result}});
 return result;
}
function economicReleaseMessage(event){
 const utc=new Date(event.scheduled_at);
 const burkina=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Ouagadougou',dateStyle:'full',timeStyle:'short'}).format(utc);
 const eastern=new Intl.DateTimeFormat('fr-FR',{timeZone:'America/New_York',dateStyle:'short',timeStyle:'short'}).format(utc);
 return '⏰ AUREVIA · PUBLICATION ÉCONOMIQUE À VENIR\n\n'+event.event_name+'\nDevise : '+event.currency+' · Impact : élevé\nHeure prévue (New York) : '+eastern+'\nHeure Burkina Faso (UTC+0) : '+burkina+'\n\nRappel envoyé au contrôle horaire précédant la publication, entre 0 et 60 minutes avant selon l’horaire exact et le passage du contrôle horaire. La date vient du calendrier FRED ; l’heure est un horaire habituel de publication, à vérifier sur la source officielle.\nSource : '+event.source_url+'\n\nCette alerte n’est pas un signal BUY/SELL.';
}
async function broadcastDueReleases(){
 if(!env('TELEGRAM_BOT_TOKEN'))return {processed:0,notice:'TELEGRAM_BOT_TOKEN absent.'};
 const now=new Date(),start=now,end=new Date(now.getTime()+65*60*1000);
 const cutoff=new Date(now.getTime()-24*60*60*1000);
 const filter='select=id,event_name,scheduled_at,source_url,source_timezone,currency,impact,telegram_broadcast_started_at&is_active=eq.true&telegram_broadcast_completed_at=is.null&scheduled_at=gte.'+encodeURIComponent(cutoff.toISOString())+'&or=(and(telegram_broadcast_started_at.is.null,scheduled_at.gte.'+encodeURIComponent(start.toISOString())+',scheduled_at.lte.'+encodeURIComponent(end.toISOString())+'),telegram_broadcast_started_at.not.is.null)&order=scheduled_at.asc&limit=30';
 const pending=await rest('economic_release_events?'+filter);
 const results=[];for(const event of (Array.isArray(pending)?pending:[]))results.push({id:event.id,...await broadcastToSubscribers('economic',event,economicReleaseMessage(event),'economic_release_events')});
 return {processed:results.length,results};
}
function globalNewsMessage(event){
 const safeTitle=String(event.title||'').replace(/[<>]/g,'').slice(0,400),safeDomain=String(event.source_domain||'').replace(/[<>]/g,'').slice(0,120);
 const dateLine=event.published_at?'Publié : '+new Date(event.published_at).toISOString():'Repéré par GDELT : '+new Date(event.seen_at).toISOString();
 return '🌍 AUREVIA · ALERTE MACRO / ACTUALITÉ INTERNATIONALE\n\n'+safeTitle+'\n\nSource : '+safeDomain+'\n'+dateLine+'\n\nLecture et vérification : '+event.source_url+'\n\nCette alerte signale une actualité à examiner. Elle ne constitue pas, à elle seule, un signal BUY/SELL.';
}
async function syncGlobalNews(){
 const articles=await fetchArticles();
 if(articles.length)await rest('global_news_events?on_conflict=external_id',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:articles});
 const cutoff=new Date(Date.now()-100*60*1000).toISOString();
 const pending=await rest('global_news_events?select=id,title,source_url,source_domain,published_at,seen_at,telegram_broadcast_started_at&telegram_broadcast_completed_at=is.null&or=(seen_at.gte.'+encodeURIComponent(cutoff)+',telegram_broadcast_started_at.not.is.null)&order=seen_at.desc&limit=75');
 const results=[];for(const item of (Array.isArray(pending)?pending:[]))results.push({id:item.id,...await broadcastToSubscribers('global_news',item,globalNewsMessage(item),'global_news_events')});
 return {fetched:articles.length,telegramProcessed:results.length,telegram:results};
}
export async function handler(event){
 if(!env('SUPABASE_URL')||!env('SUPABASE_SERVICE_ROLE_KEY'))return json(503,{ok:false,error:'Supabase service credentials are missing.'});
 const result={ok:true,source:SOURCE};
 try{result.economicCalendar=await syncEconomicCalendar();result.economicReminders=await broadcastDueReleases();}
 catch(error){result.economicCalendarError=String(error.message||error).slice(0,300);}
 try{Object.assign(result,await syncGlobalNews());}
 catch(error){result.globalNewsError=String(error.message||error).slice(0,300);}
 result.asOf=new Date().toISOString();
 const failed=Boolean(result.economicCalendarError||result.globalNewsError);
 result.ok=!failed;
 return json(failed?502:200,result);
}
