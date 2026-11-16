import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/service-status.mjs';

const userId='3ed0c702-03f1-4264-9e85-746d66401b51';
const sessionId='9bd61c1d-98a8-4b13-92bb-8796f8d0a9b0';
const jwt=`header.${Buffer.from(JSON.stringify({sub:userId,session_id:sessionId})).toString('base64url')}.signature`;
const envKeys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','TWELVEDATA_API_KEY','TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GROQ_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY'];
function setupEnv(missing=[]){
 const prior=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 for(const key of envKeys)process.env[key]=missing.includes(key)?'':(`test-${key}`);
 return ()=>{for(const key of envKeys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}};
}
function installAuthMock(){
 const old=globalThis.fetch;
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:userId}),{status:200});
  if(url.includes('/rpc/aurevia_session_is_active_for_user'))return new Response('true',{status:200});
  if(url.includes('/rpc/aurevia_is_admin'))return new Response('true',{status:200});
  return new Response('[]',{status:200});
 };
 return ()=>{globalThis.fetch=old;};
}
const event={httpMethod:'GET',headers:{authorization:`Bearer ${jwt}`}};

test('service-status distinguishes general AI configuration from full three-provider M5 readiness',async()=>{
 const restoreEnv=setupEnv(),restoreFetch=installAuthMock();
 try{
  const response=await handler(event),body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);
  assert.equal(body.services.ai.configured,true);
  assert.equal(body.services.ai.m5ConsensusReady,true);
  assert.deepEqual(body.services.ai.m5MissingProviders,[]);
  assert.deepEqual(new Set(body.services.ai.providers.map(x=>x.id)),new Set(['gemini','groq','openrouter','cloudflare']));
 }finally{restoreFetch();restoreEnv();}
});

test('service-status reports the missing provider that blocks M5 consensus',async()=>{
 const restoreEnv=setupEnv(['CLOUDFLARE_API_TOKEN']),restoreFetch=installAuthMock();
 try{
  const response=await handler(event),body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);
  assert.equal(body.services.ai.configured,true);
  assert.equal(body.services.ai.m5ConsensusReady,false);
  assert.deepEqual(body.services.ai.m5MissingProviders,['Cloudflare']);
 }finally{restoreFetch();restoreEnv();}
});
