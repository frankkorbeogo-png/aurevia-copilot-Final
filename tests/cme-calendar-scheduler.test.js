import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/cme-calendar-sync.mjs';

test('CME calendar sync accepts the scheduled POST invocation',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service'});
 let saved=null;
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url==='https://www.cmegroup.com/trading-hours.html')return new Response('<html>CME Globex Trading Schedule</html>',{status:200});
  if(url.includes('/rest/v1/cme_calendar_sync')){saved=JSON.parse(options.body);return new Response('',{status:201});}
  throw new Error('Unexpected URL '+url);
 };
 try{
  const result=await handler({httpMethod:'POST'});
  const body=JSON.parse(result.body);
  assert.equal(result.statusCode,200);
  assert.equal(body.ok,true);
  assert.equal(saved.source_key,'cme-globex-holiday-calendar');
  assert.equal(body.automaticMarketClosuresApplied,false);
 }finally{
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];
  Object.assign(process.env,oldEnv);
 }
});
