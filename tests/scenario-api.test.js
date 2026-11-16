import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handler} from '../netlify/functions/scenario-api.mjs';
const SESSION_ID='9bd61c1d-98a8-4b13-92bb-8796f8d0a9b0';
const jwt=`header.${Buffer.from(JSON.stringify({sub:'3ed0c702-03f1-4264-9e85-746d66401b51',session_id:SESSION_ID})).toString('base64url')}.signature`;
const req=body=>({httpMethod:'POST',headers:{authorization:`Bearer ${jwt}`},body:JSON.stringify(body)});
const parse=r=>JSON.parse(r.body);
test('scenario-api refuse une session absente',async()=>{const r=await handler({httpMethod:'POST',headers:{},body:'{"action":"list"}'});assert.equal(r.statusCode,401);});
test('scenario-api arrête uniquement la surveillance appartenant à l’utilisateur',async()=>{const old=globalThis.fetch;Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pub',SUPABASE_SERVICE_ROLE_KEY:'service'});let patched='';globalThis.fetch=async(url,opts={})=>{if(String(url).includes('/auth/v1/user'))return new Response(JSON.stringify({id:'3ed0c702-03f1-4264-9e85-746d66401b51'}),{status:200});if(String(url).includes('/rpc/aurevia_session_is_active_for_user'))return new Response('true',{status:200});if(String(url).includes('/rpc/aurevia_is_admin'))return new Response('true',{status:200});if(opts.method==='PATCH'){patched=String(url);return new Response(JSON.stringify([{id:'s1',status:'stopped'}]),{status:200});}return new Response('[]',{status:200});};try{const r=await handler(req({action:'stop',id:'s1'}));assert.equal(r.statusCode,200);assert.match(patched,/user_id=eq\.3ed0c702-03f1-4264-9e85-746d66401b51/);assert.match(patched,/status=in\.\(monitoring,zone_reached,entry_confirmed\)/);assert.equal(parse(r).scenario.status,'stopped');}finally{globalThis.fetch=old;for(const k of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[k];}});
test('scenario-api rejette des niveaux incohérents avant insertion',async()=>{const old=globalThis.fetch;Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pub',SUPABASE_SERVICE_ROLE_KEY:'service'});globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?new Response(JSON.stringify({id:'3ed0c702-03f1-4264-9e85-746d66401b51'}),{status:200}):new Response('true',{status:200});try{const r=await handler(req({action:'save',instrument:'XAUUSD',direction:'BUY',entry:100,entry_low:99,entry_high:101,stop_loss:105,take_profits:[110],summary:'Synthèse technique',source:'synthesis'}));assert.equal(r.statusCode,400);}finally{globalThis.fetch=old;for(const k of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[k];}});


test('scenario-api refuse les instruments retirés du catalogue, dont les indices',async()=>{
 const old=globalThis.fetch;Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pub',SUPABASE_SERVICE_ROLE_KEY:'service'});let databaseCalled=false;
 globalThis.fetch=async url=>{const u=String(url);if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'3ed0c702-03f1-4264-9e85-746d66401b51'}),{status:200});if(u.includes('/rpc/aurevia_session_is_active_for_user'))return new Response('true',{status:200});if(u.includes('/rpc/aurevia_is_admin'))return new Response('true',{status:200});databaseCalled=true;return new Response('[]',{status:200});};
 try{const r=await handler(req({action:'save',instrument:'US30',direction:'BUY',entry:100,entry_low:99,entry_high:101,stop_loss:95,take_profits:[110],summary:'Synthèse technique valide',source:'synthesis'}));assert.equal(r.statusCode,400);assert.equal(databaseCalled,false);assert.match(parse(r).error,/Instrument non pris en charge/);}finally{globalThis.fetch=old;for(const k of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[k];}
});

test('scenario-watch respecte le catalogue actif, les horaires et la fraîcheur des cotations',async()=>{
 const source=await readFile(new URL('../netlify/functions/scenario-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/getMarketInstrument/);
 assert.doesNotMatch(source,/'US30'|'NAS100'|'NDX'/);
 assert.match(source,/getMarketStatus/);
 assert.match(source,/if\(!marketStatus\.tradable\)continue/);
 assert.match(source,/interval','1min'/);
 assert.match(source,/age>90000/);
 assert.doesNotMatch(source,/api\.twelvedata\.com\/price/);
});

test('scenario-api refuse de créer une position avec une cotation de scénario périmée',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-16T19:00:00.000Z')});
 const old=globalThis.fetch;Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pub',SUPABASE_SERVICE_ROLE_KEY:'service'});let createCalled=false;
 globalThis.fetch=async(input,options={})=>{const u=String(input);if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'3ed0c702-03f1-4264-9e85-746d66401b51'}),{status:200});if(u.includes('/rpc/aurevia_session_is_active_for_user')||u.includes('/rpc/aurevia_is_admin'))return new Response('true',{status:200});if(u.includes('/rest/v1/user_preferences'))return new Response(JSON.stringify([{preferences:{account_currency:'USD'}}]),{status:200});if(u.includes('/rest/v1/aurevia_analysis_scenarios'))return new Response(JSON.stringify([{id:'s1',status:'entry_confirmed',lot_confirmation_expires_at:new Date(Date.now()+600000).toISOString(),trade_group_id:null,instrument:'XAU/USD',direction:'BUY',last_price_at:new Date(Date.now()-5*60*1000).toISOString()}]),{status:200});if(u.includes('/rpc/aurevia_create_position_from_scenario'))createCalled=true;return new Response('[]',{status:200});};
 try{const r=await handler(req({action:'create_position',id:'s1',mode:'unique',volume:0.05,contract_spec:{accountCurrency:'USD',calculationType:'contract',contractSize:100,quoteToAccount:1,feesPerLot:0,minLot:0.01,lotStep:0.01,maxLot:null},auto_journal:true}));assert.equal(r.statusCode,409);assert.equal(parse(r).code,'SCENARIO_PRICE_STALE');assert.equal(createCalled,false);}finally{globalThis.fetch=old;for(const k of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[k];}
});

test('les interfaces et le bandeau TradingView n’affichent plus les indices/énergies retirés',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/US30|NAS100|SPX500|WTIUSD|WTI\/USD|optgroup label="Énergie"/);
 assert.doesNotMatch(app,/PEPPERSTONE:US30|NASDAQ:NDX|SP:SPX|TVC:USOIL/);
 assert.match(app,/TVC:DXY/);
});

test('scenario-api valide strictement les niveaux des huit types d’ordres côté serveur',async()=>{
 const source=await readFile(new URL('../netlify/functions/scenario-api.mjs',import.meta.url),'utf8');
 assert.match(source,/normalizedOrder/);
 assert.match(source,/Géométrie STOP LIMIT incompatible/);
 assert.match(source,/Le prix d’entrée doit correspondre au niveau d’ordre/);
 assert.match(source,/Un ordre MARKET ne doit pas contenir/);
});


function installCreatePositionMocks({orderType='BUY MARKET'}={}){
 const old=globalThis.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pub',SUPABASE_SERVICE_ROLE_KEY:'service'});
 let createCalled=false,createdPayload=null;
 globalThis.fetch=async(input,options={})=>{
  const u=String(input);
  if(u.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'3ed0c702-03f1-4264-9e85-746d66401b51'}),{status:200});
  if(u.includes('/rpc/aurevia_session_is_active_for_user')||u.includes('/rpc/aurevia_is_admin'))return new Response('true',{status:200});
  if(u.includes('/rest/v1/user_preferences'))return new Response(JSON.stringify([{preferences:{account_currency:'USD'}}]),{status:200});
  if(u.includes('/rest/v1/aurevia_analysis_scenarios'))return new Response(JSON.stringify([{id:'s1',status:'entry_confirmed',lot_confirmation_expires_at:new Date(Date.now()+600000).toISOString(),trade_group_id:null,instrument:'BTC/USD',direction:'BUY',last_price_at:new Date().toISOString(),order_type:orderType,entry_confirmation_price:100,entry:100,entry_low:99,entry_high:101,stop_loss:95,take_profits:[110]}]),{status:200});
  if(u.includes('/rpc/aurevia_create_position_from_scenario')){createCalled=true;createdPayload=JSON.parse(options.body||'{}');return new Response(JSON.stringify('group-1'),{status:200});}
  return new Response('[]',{status:200});
 };
 return {restore(){globalThis.fetch=old;for(const k of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[k];},get createCalled(){return createCalled;},get createdPayload(){return createdPayload;}};
}
const validContractSpec={calculationType:'contract',contractSize:1,quoteToAccount:1,minLot:0.01,lotStep:0.01,maxLot:null,feesPerLot:0};
test('scenario-api refuse un ordre MARKET sans prix réel d’exécution manuelle',async()=>{
 const mock=installCreatePositionMocks();
 try{
  const r=await handler(req({action:'create_position',id:'s1',mode:'unique',volume:0.05,contract_spec:{...validContractSpec},auto_journal:true}));
  assert.equal(r.statusCode,400);assert.match(parse(r).error,/prix réel d’exécution manuelle est obligatoire/i);assert.equal(mock.createCalled,false);
 }finally{mock.restore();}
});
test('scenario-api transmet le prix réellement exécuté validé au RPC',async()=>{
 const mock=installCreatePositionMocks();
 try{
  const r=await handler(req({action:'create_position',id:'s1',mode:'unique',volume:0.05,contract_spec:{...validContractSpec,actualEntryPrice:101},auto_journal:true}));
  assert.equal(r.statusCode,201,parse(r).error);assert.equal(mock.createCalled,true);assert.equal(mock.createdPayload.p_contract_spec.actualEntryPrice,101);assert.equal(parse(r).actual_entry_price,101);
 }finally{mock.restore();}
});
test('scenario-api refuse un prix réel pour un ordre conditionnel non exécuté',async()=>{
 const mock=installCreatePositionMocks({orderType:'BUY LIMIT'});
 try{
  const r=await handler(req({action:'create_position',id:'s1',mode:'unique',volume:0.05,contract_spec:{...validContractSpec,actualEntryPrice:100},auto_journal:true}));
  assert.equal(r.statusCode,400);assert.match(parse(r).error,/ordre conditionnel/);assert.equal(mock.createCalled,false);
 }finally{mock.restore();}
});
test('le RPC et l’API exigent le prix réel manuel pour une entrée MARKET',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261116230200_aurevia_require_manual_actual_fill_for_market_pnl.sql',import.meta.url),'utf8');
 const api=await readFile(new URL('../netlify/functions/scenario-api.mjs',import.meta.url),'utf8');
 assert.match(sql,/ACTUAL_FILL_PRICE_REQUIRED/);
 assert.match(sql,/before insert or update of order_type, actual_entry_price/i);
 assert.match(api,/marketOrder&&actualEntry===null/);
 assert.match(api,/prix réel d’exécution manuelle est obligatoire/i);
});
