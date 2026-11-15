import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/telegram-notify.mjs';

test('une notification sans compte Telegram lié est ignorée proprement, sans 404',async()=>{
 const oldFetch=globalThis.fetch,old={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot'});
 const claims=Buffer.from(JSON.stringify({sub:'user-1',session_id:'9bd61c1d-98a8-4b13-92bb-8796f8d0a9b0'})).toString('base64url');
 let telegramCalled=false;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'user-1'}),{status:200});
  if(url.includes('/rpc/aurevia_session_is_active_for_user'))return new Response('true',{status:200});
  if(url.includes('/rest/v1/telegram_connections'))return new Response('[]',{status:200});
  if(url.includes('api.telegram.org')){telegramCalled=true;return new Response(JSON.stringify({ok:true}),{status:200});}
  throw new Error('Unexpected URL '+url);
 };
 try{
  const result=await handler({httpMethod:'POST',headers:{authorization:'Bearer header.'+claims+'.signature'},body:JSON.stringify({type:'test',text:'Test'})});
  const body=JSON.parse(result.body);
  assert.equal(result.statusCode,200);
  assert.equal(body.sent,false);
  assert.equal(body.code,'TELEGRAM_NOT_CONNECTED');
  assert.equal(telegramCalled,false);
 }finally{
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];
  Object.assign(process.env,old);
 }
});
