import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/global-news-sync.mjs';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('FRED synchronise les dates futures et Telegram rappelle les publications américaines',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot',FRED_API_KEY:'fred-key'});
 const inserted=[],messages=[],deactivated=[];const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url.includes('api.gdeltproject.org'))return response({articles:[]});
  if(url.includes('/rest/v1/economic_release_sync_state?id=eq.global'))return response([]);
  if(url.includes('api.stlouisfed.org/fred/release/dates')){
   const u=new URL(url);assert.equal(u.searchParams.get('include_release_dates_with_no_data'),'true');
   return response({release_dates:u.searchParams.get('release_id')==='10'?[{date:tomorrow}]:[]});
  }
  if(url.includes('/rest/v1/economic_release_events?on_conflict=external_id')){inserted.push(...JSON.parse(options.body));return response({},201);}
  if(url.includes('/rest/v1/economic_release_events?select=id,external_id'))return response([{id:'old-release',external_id:'FRED-10-old-date',telegram_broadcast_started_at:'2026-11-14T12:00:00.000Z'}]);
  if(url.includes('/rest/v1/economic_release_events?id=eq.old-release')){deactivated.push(JSON.parse(options.body));return response([{id:'old-release'}]);}
  if(url.includes('/rest/v1/economic_release_sync_state?on_conflict=id'))return response({},201);
  if(url.includes('/rest/v1/economic_release_events?select=id,event_name'))return response([{id:'econ-1',event_name:'US Consumer Price Index (CPI)',scheduled_at:new Date(Date.now()+60*60*1000).toISOString(),source_url:'https://www.bls.gov/cpi/',source_timezone:'America/New_York',currency:'USD',impact:'high',telegram_broadcast_started_at:null}]);
  if(url.includes('/rest/v1/telegram_event_deliveries?on_conflict='))return response({},201);
  if(url.includes('/rest/v1/telegram_event_deliveries?select=id,chat_id,attempts,status,claimed_at'))return response([{id:'delivery-1',chat_id:'123',attempts:0,status:'pending'}]);
  if(url.includes('/rest/v1/telegram_event_deliveries?id=eq.delivery-1')){if(options.method==='PATCH'&&JSON.parse(options.body||'{}').status==='sending')return response([{id:'delivery-1',attempts:1}]);return response([{id:'delivery-1'}]);}
  if(url.includes('/rest/v1/telegram_event_deliveries?select=status,attempts'))return response([{status:'sent',attempts:1}]);
  if(url.includes('/rest/v1/economic_release_events?id=eq.econ-1'))return response([{id:'econ-1'}]);
  if(url.includes('/rest/v1/telegram_connections'))return response([{user_id:'u1',chat_id:'123'}]);
  if(url.includes('api.telegram.org/botbot/sendMessage')){messages.push(JSON.parse(options.body));return response({ok:true,result:{message_id:1}});}
  if(url.includes('/rest/v1/global_news_events?select=id,title,source_url'))return response([]);
  throw new Error('Unexpected URL '+url);
 };
 try{
  const r=await handler({httpMethod:'GET'}),body=JSON.parse(r.body);
  assert.equal(r.statusCode,200);assert.equal(body.economicCalendar.status,'synced');
  assert.ok(inserted.some(x=>x.release_id===10&&x.event_name.includes('CPI')));\n  assert.deepEqual(deactivated,[{is_active:false}]);
  const cpi=inserted.find(x=>x.release_id===10);const local=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(cpi.scheduled_at));
  assert.equal(local,'08:30');assert.equal(body.economicReminders.processed,1);
  assert.equal(messages.length,1);assert.match(messages[0].text,/Heure Burkina Faso/);assert.match(messages[0].text,/horaire habituel/);
 }finally{
  globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);
 }
});
