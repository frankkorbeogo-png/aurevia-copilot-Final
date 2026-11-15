import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/global-news-sync.mjs';

test('global-news-sync returns an error when one macro subsystem fails',async()=>{
 const old={...process.env};
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='service';
 delete process.env.FRED_API_KEY;
 delete process.env.TELEGRAM_BOT_TOKEN;
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  if(String(input).includes('api.gdeltproject.org'))return new Response('GDELT unavailable',{status:503,headers:{'content-type':'text/plain'}});
  throw new Error('URL inattendue '+String(input));
 };
 try{
  const r=await handler({httpMethod:'POST'});
  const data=JSON.parse(r.body);
  assert.equal(r.statusCode,502);
  assert.match(data.globalNewsError,/GDELT HTTP 503/);
 }finally{
  globalThis.fetch=original;
  for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];
  Object.assign(process.env,old);
 }
});
