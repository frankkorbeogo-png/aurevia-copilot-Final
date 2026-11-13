import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/telegram-webhook.mjs';

const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const payload=(text='/start AB12CD34')=>({httpMethod:'POST',headers:{'x-telegram-bot-api-secret-token':'one-to-one-secret'},body:JSON.stringify({message:{text,chat:{id:445566,type:'private'},from:{id:445566,is_bot:false,username:'trader'}}})});
async function withEnv(run,fetcher){
 const original=globalThis.fetch,old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,token:process.env.TELEGRAM_BOT_TOKEN,secret:process.env.TELEGRAM_WEBHOOK_SECRET};
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot',TELEGRAM_WEBHOOK_SECRET:'one-to-one-secret'});globalThis.fetch=fetcher;
 try{return await run();}finally{globalThis.fetch=original;for(const [k,v] of Object.entries({SUPABASE_URL:old.url,SUPABASE_SERVICE_ROLE_KEY:old.key,TELEGRAM_BOT_TOKEN:old.token,TELEGRAM_WEBHOOK_SECRET:old.secret}))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
const validPrefs=[{user_id:'new-aurevia',preferences:{telegram_pair_code:'AB12CD34',telegram_pair_expires_at:new Date(Date.now()+60000).toISOString()}}];

test('refuse de lier un Telegram déjà associé à un autre compte AUREVIA',async()=>withEnv(async()=>{
 globalThis.calls=[];globalThis.sent=[];const r=await handler(payload());assert.equal(r.statusCode,200);const body=JSON.parse(r.body);assert.equal(body.paired,false);assert.equal(body.reason,'telegram_already_linked');assert.equal(globalThis.calls.some(x=>x.includes('on_conflict=user_id')),false);assert.ok(globalThis.sent.some(x=>x.includes('déconnecte Telegram')));
},async(url,options={})=>{const u=String(url);globalThis.calls.push(u);if(u.includes('preferences->>telegram_pair_code'))return response(validPrefs);if(u.includes('telegram_connections?select=user_id'))return response([{user_id:'old-aurevia'}]);if(u.includes('api.telegram.org')){globalThis.sent??=[];globalThis.sent.push(JSON.parse(options.body).text);return response({ok:true,result:{message_id:1}});}return response([]);}));

test('refuse de remplacer le Telegram déjà lié au même compte AUREVIA',async()=>withEnv(async()=>{
 globalThis.calls=[];globalThis.sent=[];const r=await handler(payload());assert.equal(r.statusCode,200);const body=JSON.parse(r.body);assert.equal(body.paired,false);assert.equal(body.reason,'aurevia_already_linked');assert.equal(globalThis.calls.some(x=>x.includes('on_conflict=user_id')),false);assert.ok(globalThis.sent.some(x=>x.includes('possède déjà un autre compte Telegram')));
},async(url,options={})=>{const u=String(url);globalThis.calls.push(u);if(u.includes('preferences->>telegram_pair_code'))return response(validPrefs);if(u.includes('telegram_connections?select=user_id'))return response([]);if(u.includes('telegram_connections?select=chat_id'))return response([{chat_id:'old-chat'}]);if(u.includes('api.telegram.org')){globalThis.sent??=[];globalThis.sent.push(JSON.parse(options.body).text);return response({ok:true,result:{message_id:1}});}return response([]);}));
