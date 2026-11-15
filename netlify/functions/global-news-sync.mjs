import crypto from 'node:crypto';

const SOURCE='GDELT DOC 2.0';
const QUERY='("central bank" OR "interest rate" OR inflation OR CPI OR GDP OR unemployment OR sanctions OR tariff OR tariffs OR war OR conflict OR ceasefire OR "oil prices" OR OPEC OR energy crisis OR "trade restrictions")';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
const env=name=>(process.env[name]||'').trim();
const supabase=(path)=>fetch(env('SUPABASE_URL').replace(/\/$/, '')+'/rest/v1/'+path,{
 headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY')}
});
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
 const publishedAt=parseDate(article.seendate||article.datetime||article.date);
 if(!publishedAt||Date.now()-Date.parse(publishedAt)>45*60*1000||Date.parse(publishedAt)>Date.now()+5*60*1000)return null;
 const externalId=crypto.createHash('sha256').update(url).digest('hex');
 const tone=Number(article.tone);
 return {external_id:externalId,title,source_url:url,source_domain:parsed.hostname.replace(/^www\./,''),source_country:String(article.sourcecountry||'').slice(0,80),source_language:String(article.language||'').slice(0,40),published_at:publishedAt,category:'macro_geopolitics',tone:Number.isFinite(tone)?tone:null,source_provider:SOURCE};
}
async function fetchArticles(){
 const url=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
 url.searchParams.set('query',QUERY);url.searchParams.set('mode','ArtList');url.searchParams.set('format','json');
 url.searchParams.set('maxrecords','75');url.searchParams.set('timespan','30min');url.searchParams.set('sort','DateDesc');
 const response=await fetch(url,{headers:{accept:'application/json','user-agent':'AUREVIA-COPILOT/1.0 (global macro news; https://github.com/frankkorbeogo-png/aurevia-copilot-Final)'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('GDELT HTTP '+response.status);
 const type=response.headers.get('content-type')||'';if(!type.includes('json'))throw new Error('GDELT a retourné un contenu non JSON.');
 const data=await response.json();const articles=Array.isArray(data.articles)?data.articles:[];
 return articles.map(normalizeArticle).filter(Boolean);
}
async function broadcast(event){
 const token=env('TELEGRAM_BOT_TOKEN');if(!token)return {status:'not_configured',sent:0,failed:0,skipped:0};
 const claimed=await rest('global_news_events?id=eq.'+encodeURIComponent(event.id)+'&telegram_broadcast_started_at=is.null&select=id',{
  method:'PATCH',prefer:'return=representation',body:{telegram_broadcast_started_at:new Date().toISOString()}
 });
 if(!Array.isArray(claimed)||!claimed.length)return {status:'already_claimed',sent:0,failed:0,skipped:0};
 const recipients=await rest('telegram_connections?select=user_id,chat_id&notify_economic_announcements=eq.true&chat_id=not.is.null&limit=5000');
 const unique=[...new Set((Array.isArray(recipients)?recipients:[]).filter(x=>x.user_id&&x.chat_id).map(x=>String(x.chat_id)))];
 let sent=0,failed=0;const errors=[];
 const safeTitle=String(event.title||'').replace(/[<>]/g,'').slice(0,400);
 const safeDomain=String(event.source_domain||'').replace(/[<>]/g,'').slice(0,120);
 const message='🌍 AUREVIA · ALERTE MACRO / ACTUALITÉ INTERNATIONALE\n\n'+safeTitle+'\n\nSource : '+safeDomain+'\nPublié : '+new Date(event.published_at).toISOString()+'\n\nLecture et vérification : '+event.source_url+'\n\nCette alerte signale une actualité à examiner. Elle ne constitue pas, à elle seule, un signal BUY/SELL.';
 for(const chatId of unique){
  try{
   const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text:message,disable_web_page_preview:true}),signal:AbortSignal.timeout(9000)});
   const result=await r.json().catch(()=>null);if(!r.ok||!result?.ok)throw new Error(result?.description||'Telegram HTTP '+r.status);sent++;
  }catch(error){failed++;if(errors.length<5)errors.push(String(error.message||error).slice(0,160));}
 }
 const result={status:failed?(sent?'partial':'failed'):'sent',sent,failed,skipped:0,errors};
 await rest('global_news_events?id=eq.'+encodeURIComponent(event.id),{method:'PATCH',body:{telegram_broadcast_completed_at:new Date().toISOString(),telegram_broadcast_result:result}});
 return result;
}
export async function handler(event){
 if(event.httpMethod&&event.httpMethod!=='GET')return json(405,{ok:false,error:'Method not allowed.'});
 if(!env('SUPABASE_URL')||!env('SUPABASE_SERVICE_ROLE_KEY'))return json(503,{ok:false,error:'Supabase service credentials are missing.'});
 try{
  const articles=await fetchArticles();
  if(articles.length)await rest('global_news_events?on_conflict=external_id',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:articles});
  const pending=await rest('global_news_events?select=id,title,source_url,source_domain,published_at&telegram_broadcast_started_at=is.null&published_at=gte.'+encodeURIComponent(new Date(Date.now()-45*60*1000).toISOString())+'&order=published_at.desc&limit=20');
  const results=[];for(const item of (Array.isArray(pending)?pending:[]))results.push({id:item.id,...await broadcast(item)});
  return json(200,{ok:true,source:SOURCE,fetched:articles.length,telegramProcessed:results.length,telegram:results});
 }catch(error){console.error('[AUREVIA global news]',error);return json(502,{ok:false,error:String(error.message||error).slice(0,300)});}
}
