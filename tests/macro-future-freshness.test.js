import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/macro-context.mjs';

test('macro-context marks future DXY and FRED timestamps as future, not recent', async()=>{
 const old={...process.env};
 process.env.FRED_API_KEY='fred-test';
 process.env.TWELVEDATA_API_KEY='td-test';
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='publishable';
 process.env.SUPABASE_SERVICE_ROLE_KEY='service';
 const original=globalThis.fetch;
 const claims=Buffer.from(JSON.stringify({sub:'future-user',session_id:'9bd61c1d-98a8-4b13-92bb-8796f8d0a9b0'})).toString('base64url');
 const tomorrow=new Date(Date.now()+36*60*60*1000).toISOString().slice(0,10);
 const futureEpoch=Math.floor((Date.now()+60*60*1000)/1000);
 globalThis.fetch=async input=>{
  const u=String(input);
  if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'future-user'}),{status:200});
  if(u.includes('/rpc/aurevia_session_is_active_for_user'))return new Response('true',{status:200});
  if(u.includes('/rpc/aurevia_is_admin'))return new Response('false',{status:200});
  if(u.includes('/rpc/aurevia_license_status'))return new Response(JSON.stringify({ok:true,status:'trial'}),{status:200});
  if(u.includes('api.twelvedata.com/quote'))return new Response(JSON.stringify({symbol:'DXY',close:'105.2',timestamp:futureEpoch,last_quote_at:futureEpoch}),{status:200});
  if(u.includes('showmytrades.com'))return new Response(JSON.stringify({events:[]}),{status:200});
  if(u.includes('api.stlouisfed.org'))return new Response(JSON.stringify({observations:[{date:tomorrow,value:'100'},{date:'2026-11-01',value:'99'}]}),{status:200});
  if(u.includes('/rest/v1/global_news_events')||u.includes('/rest/v1/economic_release_events'))return new Response('[]',{status:200});
  throw new Error('URL inattendue '+u);
 };
 try{
  const r=await handler({httpMethod:'GET',rawUrl:'https://aurevia.local/api/macro-context?instrument=XAUUSD',headers:{authorization:`Bearer header.${claims}.signature`}});
  const data=JSON.parse(r.body);
  assert.equal(r.statusCode,200);
  assert.equal(data.dxy.freshness,'future');
  assert.equal(data.dxy.configured,false);
  assert.equal(data.dxy.price,null);
  assert.equal(data.series.NOMINAL_YIELD_10Y.freshness,'future');
  assert.equal(data.series.NOMINAL_YIELD_10Y.available,false);
 }finally{
  globalThis.fetch=original;
  for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];
  Object.assign(process.env,old);
 }
});
