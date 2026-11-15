import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/market-quote.mjs';

async function withAuthFetch(providerResponse,run){
 const old={...process.env};
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='publishable';
 process.env.SUPABASE_SERVICE_ROLE_KEY='service';
 process.env.TWELVEDATA_API_KEY='td-test';
 const original=globalThis.fetch;
 const claims=Buffer.from(JSON.stringify({sub:'quote-user',session_id:'9bd61c1d-98a8-4b13-92bb-8796f8d0a9b0'})).toString('base64url');
 let providerUrl='';
 globalThis.fetch=async input=>{
  const u=String(input);
  if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'quote-user'}),{status:200});
  if(u.includes('/rpc/aurevia_session_is_active_for_user'))return new Response('true',{status:200});
  providerUrl=u;
  return providerResponse();
 };
 try{return await run({claims,getProviderUrl:()=>providerUrl});}
 finally{
  globalThis.fetch=original;
  for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];
  Object.assign(process.env,old);
 }
}

test('market-quote uses the quote endpoint and returns timestamped quote metadata',async()=>{
 await withAuthFetch(()=>new Response(JSON.stringify({symbol:'XAG/USD',close:'31.25',timestamp:Math.floor(Date.now()/1000)}),{status:200}),async({claims,getProviderUrl})=>{
  const r=await handler({httpMethod:'GET',rawQuery:'symbol=XAG/USD',headers:{authorization:`Bearer header.${claims}.signature`}});
  const data=JSON.parse(r.body);
  assert.equal(r.statusCode,200);
  assert.equal(data.price,31.25);
  assert.ok(data.asOf);
  assert.match(getProviderUrl(),/api\.twelvedata\.com\/quote/);
 });
});

test('market-quote does not hide a Twelve Data quota error with cached prices',async()=>{
 await withAuthFetch(()=>new Response(JSON.stringify({code:429,message:'API credits exhausted'}),{status:200}),async({claims})=>{
  const r=await handler({httpMethod:'GET',rawQuery:'symbol=XAG/USD',headers:{authorization:`Bearer header.${claims}.signature`}});
  const data=JSON.parse(r.body);
  assert.equal(r.statusCode,429);
  assert.equal(data.code,'TWELVEDATA_QUOTA');
 });
});

test('market-quote rejects provider timestamps too far in the future',async()=>{
 await withAuthFetch(()=>new Response(JSON.stringify({symbol:'XAG/USD',close:'31.25',timestamp:Math.floor((Date.now()+60*60*1000)/1000)}),{status:200}),async({claims})=>{
  const r=await handler({httpMethod:'GET',rawQuery:'symbol=XAG/USD',headers:{authorization:`Bearer header.${claims}.signature`}});
  const data=JSON.parse(r.body);
  assert.equal(r.statusCode,502);
  assert.equal(data.code,'TWELVEDATA_FUTURE_TIMESTAMP');
 });
});
