import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/macro-context.mjs';

const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('le contexte macro expose les actualités GDELT stockées sans inventer de données',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable',SUPABASE_SERVICE_ROLE_KEY:'service'});
 delete process.env.FRED_API_KEY;delete process.env.TWELVEDATA_API_KEY;
 const claims=Buffer.from(JSON.stringify({sub:'macro-user',session_id:'9bd61c1d-98a8-4b13-92bb-8796f8d0a9b0'})).toString('base64url');
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes('/auth/v1/user'))return response({id:'macro-user'});
  if(url.includes('/rpc/aurevia_session_is_active_for_user'))return response(true);
  if(url.includes('showmytrades.com/api/public/calendar/v1'))return response({events:[]});
  if(url.includes('/rest/v1/global_news_events'))return response([{title:'Central bank announces a rate decision',source_url:'https://news.example.com/rates',source_domain:'news.example.com',source_country:'US',source_language:'English',published_at:new Date().toISOString(),category:'macro_geopolitics',tone:-1.2,source_provider:'GDELT DOC 2.0'}]);
  throw new Error('Unexpected URL '+url);
 };
 try{
  const result=await handler({httpMethod:'GET',rawUrl:'https://aurevia.local/api/macro-context?instrument=XAUUSD',headers:{authorization:'Bearer header.'+claims+'.signature'}});
  const data=JSON.parse(result.body);
  assert.equal(result.statusCode,200);assert.equal(data.globalNews.configured,true);
  assert.equal(data.globalNews.source,'GDELT DOC 2.0');assert.equal(data.globalNews.articles.length,1);
  assert.equal(data.globalNews.articles[0].title,'Central bank announces a rate decision');
  assert.match(data.globalNews.notice,/ni des signaux de trading/);
 }finally{
  globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);
 }
});
