import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/telegram-webhook.mjs';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const headers={'x-telegram-bot-api-secret-token':'secret'};
const message=text=>({httpMethod:'POST',headers,body:JSON.stringify({message:{text,chat:{id:123,type:'private'},from:{id:123,is_bot:false}}})});
const callback=data=>({httpMethod:'POST',headers,body:JSON.stringify({callback_query:{id:'cb-1',data,from:{id:123,is_bot:false},message:{chat:{id:123,type:'private'}}}})});

test('Telegram guide l’utilisateur par boutons et questions simples, puis transmet le snapshot validé à la RPC',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot',TELEGRAM_WEBHOOK_SECRET:'secret'});
 let prefs={account_currency:'USD'},rpcBody=null,telegramMessages=[];const scenario={id:'scenario-1',instrument:'XAU/USD',direction:'BUY',entry:4000,stop_loss:3990,take_profits:[4010,4020],lot_confirmation_expires_at:new Date(Date.now()+600000).toISOString(),trade_group_id:null};
 globalThis.fetch=async(input,options={})=>{const url=String(input);if(url.includes('/rest/v1/telegram_connections'))return response([{user_id:'user-1'}]);if(url.includes('/rest/v1/user_preferences')){if(options.method==='PATCH'){prefs=JSON.parse(options.body).preferences;return response({},200);}return response([{preferences:prefs}]);}if(url.includes('/rest/v1/aurevia_analysis_scenarios'))return response([scenario]);if(url.includes('/rpc/aurevia_create_position_from_scenario')){rpcBody=JSON.parse(options.body);return response('00000000-0000-4000-8000-000000000001');}if(url.includes('api.telegram.org')){const payload=JSON.parse(options.body);telegramMessages.push(payload);return response({ok:true,result:{message_id:1}});}throw new Error('Unexpected URL '+url);};
 try{
  let r=await handler(callback('start:ABCD1234:unique'));assert.equal(r.statusCode,200);assert.equal(prefs.telegram_trade_setup.step,'lot');
  for(const value of ['0.05','200']){r=await handler(message(value));assert.equal(r.statusCode,200);}
  r=await handler(callback('calc:ABCD1234:contract'));assert.equal(r.statusCode,200);
  for(const value of ['100','0.01','0.01','10','7','ignorer']){r=await handler(message(value));assert.equal(r.statusCode,200);}
  assert.equal(prefs.telegram_trade_setup.step,'review');assert.ok(telegramMessages.some(x=>x.text?.includes('Vérifie tes paramètres')));
  r=await handler(callback('confirm:ABCD1234'));assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).callback,true);
  assert.equal(rpcBody.p_mode,'unique');assert.equal(rpcBody.p_volume,0.05);assert.equal(rpcBody.p_contract_spec.contractSize,100);assert.equal(rpcBody.p_contract_spec.accountCurrency,'USD');assert.equal(rpcBody.p_contract_spec.quoteToAccount,1);assert.equal(rpcBody.p_broker_snapshot.accountCurrency,'USD');assert.equal(prefs.telegram_trade_setup,undefined);assert.ok(telegramMessages.some(x=>x.text?.includes('POSITION ENREGISTRÉE')));
 }finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});

test('Telegram refuse un lot non conforme aux minimum et pas broker sans créer de position',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot',TELEGRAM_WEBHOOK_SECRET:'secret'});let prefs={account_currency:'USD'},rpcCalled=false;
 globalThis.fetch=async(input,options={})=>{const url=String(input);if(url.includes('/rest/v1/telegram_connections'))return response([{user_id:'user-1'}]);if(url.includes('/rest/v1/user_preferences')){if(options.method==='PATCH'){prefs=JSON.parse(options.body).preferences;return response({},200);}return response([{preferences:prefs}]);}if(url.includes('/rest/v1/aurevia_analysis_scenarios'))return response([{id:'scenario-1',instrument:'XAU/USD',direction:'BUY',lot_confirmation_expires_at:new Date(Date.now()+600000).toISOString(),trade_group_id:null}]);if(url.includes('/rpc/')){rpcCalled=true;return response('00000000-0000-4000-8000-000000000001');}if(url.includes('api.telegram.org'))return response({ok:true,result:{message_id:1}});throw new Error('Unexpected URL '+url);};
 try{await handler(callback('start:ABCD1234:unique'));for(const value of ['0.015','200'])await handler(message(value));await handler(callback('calc:ABCD1234:contract'));for(const value of ['100','0.01','0.01','10','0','ignorer'])await handler(message(value));await handler(callback('confirm:ABCD1234'));assert.equal(rpcCalled,false);assert.equal(prefs.telegram_trade_setup.step,'lot');}finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});

test('Telegram exige la devise déjà enregistrée dans les paramètres sans la redemander à chaque trade',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TELEGRAM_BOT_TOKEN:'bot',TELEGRAM_WEBHOOK_SECRET:'secret'});let prefs={},messages=[];
 globalThis.fetch=async(input,options={})=>{const url=String(input);if(url.includes('/rest/v1/telegram_connections'))return response([{user_id:'user-1'}]);if(url.includes('/rest/v1/user_preferences'))return response([{preferences:prefs}]);if(url.includes('api.telegram.org')){messages.push(JSON.parse(options.body));return response({ok:true,result:{message_id:1}});}throw new Error('Unexpected URL '+url);};
 try{await handler(callback('start:ABCD1234:unique'));assert.equal(prefs.telegram_trade_setup,undefined);assert.ok(messages.some(x=>x.text?.includes('Paramètres → Devise du compte')));}finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];Object.assign(process.env,oldEnv);}
});
