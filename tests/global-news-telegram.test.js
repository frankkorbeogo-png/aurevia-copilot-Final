import test from 'node:test';
import assert from 'node:assert/strict';
import {handler as syncNews} from '../netlify/functions/global-news-sync.mjs';
const response=(data,status=200,headers={'content-type':'application/json'})=>new Response(JSON.stringify(data),{status,headers});

test('GDELT récupère 90 minutes et le registre Telegram conserve les accusés de réception',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot'});delete process.env.FRED_API_KEY;
 const calls={insert:null,telegram:[],claims:0};
 globalThis.fetch=async(input,options={})=>{
  const url=String(input),method=options.method||'GET';
  if(url.includes('api.gdeltproject.org')){
   assert.match(url,/mode=ArtList/);assert.match(url,/timespan=90min/);
   return response({articles:[{url:'https://news.example.com/central-bank-rates',title:'Central bank announces a rate decision',seendate:new Date().toISOString(),sourcecountry:'US',language:'English',tone:'-1.2'}]});
  }
  if(url.includes('/rest/v1/economic_release_sync_state?id=eq.global'))return response([]);
  if(url.includes('/rest/v1/economic_release_sync_state?id=eq.global'))return response([]);
  if(url.includes('/rest/v1/economic_release_events?on_conflict=external_id'))return response([],201);
  if(url.includes('/rest/v1/economic_release_events?select=id,external_id,release_id'))return response([]);
  if(url.includes('/rest/v1/economic_release_sync_state?id=eq.global'))return response([]);
  if(url.includes('/rest/v1/economic_release_events?on_conflict=external_id'))return response([],201);
  if(url.includes('/rest/v1/economic_release_events?select=id,event_name'))return response([]);
  if(url.includes('/rest/v1/global_news_events?on_conflict=external_id')){calls.insert=JSON.parse(options.body);return response([],201);}
  if(url.includes('/rest/v1/global_news_events?select=id,title,source_url'))return response([{id:'event-1',title:'Central bank announces a rate decision',source_url:'https://news.example.com/central-bank-rates',source_domain:'news.example.com',published_at:null,seen_at:new Date().toISOString(),telegram_broadcast_started_at:null}]);
  if(url.includes('/rest/v1/global_news_events?id=eq.event-1'))return response([]);
  if(url.includes('/rest/v1/telegram_connections'))return response([{user_id:'u1',chat_id:'123'},{user_id:'u2',chat_id:'456'}]);
  if(url.includes('/rest/v1/telegram_event_deliveries?on_conflict='))return response([],201);
  if(url.includes('/rest/v1/telegram_event_deliveries?select=id,chat_id,attempts,status,claimed_at'))return response([{id:'delivery-1',chat_id:'123',attempts:0,status:'pending'},{id:'delivery-2',chat_id:'456',attempts:0,status:'pending'}]);
  if(url.includes('/rest/v1/telegram_event_deliveries?id=eq.delivery-')){
   if(method==='PATCH'&&JSON.parse(options.body||'{}').status==='sending'){calls.claims++;return response([{id:'delivery-1',attempts:1}]);}
   return response([]);
  }
  if(url.includes('/rest/v1/telegram_event_deliveries?select=status,attempts'))return response([{status:'sent',attempts:1},{status:'sent',attempts:1}]);
  if(url.includes('api.telegram.org/botbot/sendMessage')){calls.telegram.push(JSON.parse(options.body));return response({ok:true,result:{message_id:calls.telegram.length}});}
  throw new Error('Unexpected URL '+url);
 };
 try{
  const result=await syncNews({httpMethod:'POST'}),body=JSON.parse(result.body);
  assert.equal(result.statusCode,200);assert.equal(body.ok,true);assert.equal(body.fetched,1);
  assert.equal(calls.insert.length,1);assert.equal(calls.insert[0].category,'macro_geopolitics');
  assert.equal(calls.claims,2);assert.equal(calls.telegram.length,2);
  assert.ok(calls.telegram[0].text.includes('ALERTE MACRO'));
  assert.ok(calls.telegram[0].text.includes('ne constitue pas, à elle seule, un signal BUY/SELL'));
 }finally{
  globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);
 }
});

test('sans token Telegram, le flux GDELT reste disponible sans prétendre à une diffusion',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service'});delete process.env.TELEGRAM_BOT_TOKEN;delete process.env.FRED_API_KEY;
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes('api.gdeltproject.org'))return response({articles:[]});
  if(url.includes('/rest/v1/economic_release_sync_state?id=eq.global'))return response([]);
  if(url.includes('/rest/v1/economic_release_events?on_conflict=external_id'))return response([],201);
  if(url.includes('/rest/v1/economic_release_events?select=id,event_name'))return response([]);
  if(url.includes('/rest/v1/global_news_events?select=id,title,source_url'))return response([]);
  throw new Error('Unexpected URL '+url);
 };
 try{const r=await syncNews({httpMethod:'POST'}),d=JSON.parse(r.body);assert.equal(r.statusCode,200);assert.equal(d.telegramProcessed,0);}
 finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});


test('une reprise Telegram renvoie uniquement au destinataire dont le premier envoi a échoué',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot'});delete process.env.FRED_API_KEY;
 const deliveries=new Map(),sendCount={'123':0,'456':0};let completed=false;
 globalThis.fetch=async(input,options={})=>{
  const url=String(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
  if(url.includes('api.gdeltproject.org'))return response({articles:[]});
  if(url.includes('/rest/v1/economic_release_events?select=id,event_name'))return response([]);
  if(url.includes('/rest/v1/economic_release_sync_state?id=eq.global'))return response([]);
  if(url.includes('/rest/v1/economic_release_events?on_conflict=external_id'))return response([],201);
  if(url.includes('/rest/v1/economic_release_events?select=id,event_name'))return response([]);
  if(url.includes('/rest/v1/global_news_events?on_conflict=external_id'))return response([],201);
  if(url.includes('/rest/v1/global_news_events?select=id,title,source_url')){
   return response(completed?[]:[{id:'retry-event',title:'Rate decision follow-up',source_url:'https://news.example.com/rates',source_domain:'news.example.com',published_at:null,seen_at:new Date().toISOString(),telegram_broadcast_started_at:'2026-11-15T08:00:00Z'}]);
  }
  if(url.includes('/rest/v1/global_news_events?id=eq.retry-event')){if(body.telegram_broadcast_completed_at)completed=true;return response([]);}
  if(url.includes('/rest/v1/telegram_connections'))return response([{user_id:'u1',chat_id:'123'},{user_id:'u2',chat_id:'456'}]);
  if(url.includes('/rest/v1/telegram_event_deliveries?on_conflict=')){
   for(const row of JSON.parse(options.body||'[]'))if(!deliveries.has(row.chat_id))deliveries.set(row.chat_id,{id:'d-'+row.chat_id,chat_id:row.chat_id,attempts:0,status:'pending'});
   return response([],201);
  }
  if(url.includes('/rest/v1/telegram_event_deliveries?select=id,chat_id,attempts,status,claimed_at')){
   return response([...deliveries.values()].filter(x=>(x.status==='pending'||x.status==='failed'||(x.status==='sending'&&Date.parse(x.claimed_at)<Date.now()-10*60*1000))&&x.attempts<5));
  }
  if(url.includes('/rest/v1/telegram_event_deliveries?id=eq.d-')){
   const id=url.match(/id=eq\.(d-[^&]+)/)?.[1],row=[...deliveries.values()].find(x=>x.id===id);if(!row)return response([]);
   if(method==='PATCH'&&body.status==='sending'){if(!['pending','failed'].includes(row.status)&&!(row.status==='sending'&&Date.parse(row.claimed_at)<Date.now()-10*60*1000))return response([]);row.status='sending';row.attempts=body.attempts;row.claimed_at=body.claimed_at;return response([{id:row.id,attempts:row.attempts}]);}
   Object.assign(row,body);return response([]);
  }
  if(url.includes('/rest/v1/telegram_event_deliveries?select=status,attempts'))return response([...deliveries.values()].map(({status,attempts})=>({status,attempts})));
  if(url.includes('api.telegram.org/botbot/sendMessage')){
   const chat=String(body.chat_id);sendCount[chat]++;
   if(chat==='456'&&sendCount[chat]===1)return response({ok:false,description:'temporary failure'},500);
   return response({ok:true,result:{message_id:sendCount[chat]}});
  }
  throw new Error('Unexpected URL '+url);
 };
 try{
  const first=await syncNews({httpMethod:'POST'}),firstBody=JSON.parse(first.body);
  assert.equal(first.statusCode,200);assert.equal(firstBody.telegram[0].status,'retry_pending');
  assert.equal(sendCount['123'],1);assert.equal(sendCount['456'],1);
  const second=await syncNews({httpMethod:'POST'}),secondBody=JSON.parse(second.body);
  assert.equal(second.statusCode,200);assert.equal(secondBody.telegram[0].status,'sent');
  assert.equal(sendCount['123'],1);assert.equal(sendCount['456'],2);
  assert.equal(deliveries.get('123').status,'sent');assert.equal(deliveries.get('456').status,'sent');
 }finally{
  globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);
 }
});
