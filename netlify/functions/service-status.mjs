import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
import {configuredAIProviders} from './_ai-provider.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
export async function handler(event){
 if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'});
 try{const context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Connexion requise.',code:error.code||null});}
 const has=name=>Boolean(process.env[name]?.trim());
async function probeTradeSchema(){
 const url=BASE_URL()+'/rest/v1/trading_positions?select=actual_entry_price&limit=0';
 try{const response=await fetch(url,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY}});if(response.ok)return {ready:true,missingColumns:[]};const detail=(await response.text()).slice(0,220);return {ready:false,missingColumns:/actual_entry_price/i.test(detail)?['actual_entry_price']:[],error:detail||'Schéma de suivi indisponible'};}catch(error){return {ready:false,missingColumns:['actual_entry_price'],error:String(error.message||error).slice(0,220)};}
}
const BASE_URL=()=>String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
 const supabaseServer=has('SUPABASE_URL')&&has('SUPABASE_SERVICE_ROLE_KEY');
 const aiProviders=configuredAIProviders();
 const providerIds=new Set(aiProviders.map(provider=>provider.id));
 const m5Required=['groq','openrouter','cloudflare'];
 const m5MissingProviders=m5Required.filter(id=>!providerIds.has(id));
 const providerNames={groq:'Groq',openrouter:'OpenRouter',cloudflare:'Cloudflare'};
 const tradeSchema=supabaseServer?await probeTradeSchema():{ready:false,missingColumns:[],error:'Identifiants Supabase serveur absents'};
 const tradeMonitorEnv=has('TWELVEDATA_API_KEY')&&supabaseServer&&has('TELEGRAM_BOT_TOKEN');
 return json(200,{services:{ai:{configured:aiProviders.length>0,provider:'AUREVIA',m5ConsensusConfigured:m5MissingProviders.length===0,m5MissingProviders:m5MissingProviders.map(id=>providerNames[id]),providers:aiProviders.map(({id,name,model})=>({id,name,model}))},marketData:{configured:has('TWELVEDATA_API_KEY')},supabase:{configured:supabaseServer},telegram:{configured:has('TELEGRAM_BOT_TOKEN')&&has('TELEGRAM_WEBHOOK_SECRET')&&(has('SUPABASE_PUBLISHABLE_KEY')||has('SUPABASE_ANON_KEY'))&&supabaseServer},tradeMonitor:{configured:tradeMonitorEnv&&tradeSchema.ready,schemaReady:tradeSchema.ready,missingColumns:tradeSchema.missingColumns,schemaError:tradeSchema.error||null}},checkedAt:new Date().toISOString()});
}
