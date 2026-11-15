import test from 'node:test';
import assert from 'node:assert/strict';
import {handler as syncNews} from '../netlify/functions/global-news-sync.mjs';

const response=(data,status=200,headers={'content-type':'application/json'})=>new Response(JSON.stringify(data),{status,headers});
test('le synchroniseur GDELT stocke les titres récents et les diffuse aux abonnés Telegram économiques',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot'});
 const calls={insert:null,telegram:[],claimed:0};
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url.includes('api.gdeltproject.org')){
   assert.match(url,/mode=ArtList/);assert.match(url,/timespan=30min/);
   return response({articles:[{url:'https://news.example.com/central-bank-rates',title:'Central bank announces a rate decision',seendate:new Date(Date.now()-5*60*1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'').replace('T','T').replace('Z','Z'),sourcecountry:'US',language:'English',tone:'-1.2'}]});
  }
  if(url.includes('/rest/v1/global_news_events?on_conflict=external_id')){calls.insert=JSON.parse(options.body);return response({},201);}
  if(url.includes('/rest/v1/global_news_events?select=id,title,source_url'))return response([{id:'event-1',title:'Central bank announces a rate decision',source_url:'https://news.example.com/central-bank-rates',source_domain:'news.example.com',published_at:new Date().toISOString()}]);
  if(url.includes('/rest/v1/global_news_events?id=eq.event-1')){calls.claimed++;return response([{id:'event-1'}]);}
  if(url.includes('/rest/v1/telegram_connections'))return response([{user_id:'u1',chat_id:'123'},{user_id:'u2',chat_id:'456'}]);
  if(url.includes('api.telegram.org/botbot/sendMessage')){calls.telegram.push(JSON.parse(options.body));return response({ok:true,result:{message_id:calls.telegram.length}});}
  throw new Error('Unexpected URL '+url);
 };
 try{
  const result=await syncNews({httpMethod:'GET'});const body=JSON.parse(result.body);
  assert.equal(result.statusCode,200);assert.equal(body.ok,true);assert.equal(body.fetched,1);
  assert.equal(calls.insert.length,1);assert.equal(calls.insert[0].category,'macro_geopolitics');
  assert.equal(calls.claimed,1);assert.equal(calls.telegram.length,2);
  assert.match(calls.telegram[0].text,/ALERTE MACRO/);assert.match(calls.telegram[0].text,/ne constitue pas, à elle seule, un signal BUY\/SELL/);
 }finally{
  globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);
 }
});

test('sans token Telegram, le flux de nouvelles reste enregistré mais aucune diffusion n’est prétendue',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service'});delete process.env.TELEGRAM_BOT_TOKEN;
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes('api.gdeltproject.org'))return response({articles:[]});
  if(url.includes('/rest/v1/global_news_events?select=id,title,source_url'))return response([]);
  throw new Error('Unexpected URL '+url);
 };
 try{const r=await syncNews({httpMethod:'GET'});const d=JSON.parse(r.body);assert.equal(r.statusCode,200);assert.equal(d.telegramProcessed,0);}
 finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});
