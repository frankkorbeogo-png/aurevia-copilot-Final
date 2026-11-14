import {verifyBearerUser,assertActiveSession,rpc,json} from './_session-auth.mjs';
import {configuredAIProviders} from './_ai-provider.mjs';
import {getMarketStatus} from '../../market-hours.js';
const ALLOWED=new Set(['XAU/USD','XAG/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','BTC/USD','ETH/USD']);
const rate=new Map();
const clean=(v,n)=>String(v||'').replace(/[\r\n\t]+/g,' ').slice(0,n||300);
function allowed(id){const now=Date.now(),x=rate.get(id);if(!x||now-x.start>60000){rate.set(id,{start:now,count:1});return true;}if(x.count>=2)return false;x.count++;return true;}
function parseJson(s){return JSON.parse(String(s).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
async function call(p,messages){
 const start=Date.now();
 const timeout=p.id==='cloudflare'?9000:p.id==='openrouter'?12000:7000;
 const deadline=start+timeout;
 const body={model:p.model,messages:messages,temperature:0.2,stream:false};
 if(p.id==='groq'){
  body.max_completion_tokens=1400;
  if(p.model.indexOf('openai/gpt-oss-')===0){
   body.reasoning_effort='low';body.include_reasoning=false;body.response_format={type:'json_object'};
  }
 }else if(p.id==='openrouter'){
  body.max_tokens=1600;
  body.response_format={type:'json_object'};
 }else body.max_tokens=1600;
 let attempts=0;
 try{
  while(Date.now()<deadline){
   const remaining=deadline-Date.now();
   if(remaining<=0)break;
   attempts++;
   const r=await fetch(p.url,{
    method:'POST',
    headers:{authorization:'Bearer '+p.key,'content-type':'application/json',...(p.id==='openrouter'?{'HTTP-Referer':'https://aurevia-copilot-ia.netlify.app','X-Title':'AUREVIA COPILOT'}:{})},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(remaining)
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok)return {provider:p.name,model:p.model,ok:false,status:r.status,latencyMs:Date.now()-start,timeoutBudgetMs:timeout,attempts,code:r.status===503?'PROVIDER_OVERLOADED':r.status===429?'RATE_LIMIT_OR_QUOTA':r.status===402?'BILLING_REQUIRED':r.status===401||r.status===403?'AUTH_OR_PERMISSION':'HTTP_ERROR',error:clean((d.error&&d.error.message)||d.message||('HTTP '+r.status),180),diagnostic:r.status===503?'Google a renvoyé 503 après une tentative dans le budget autorisé : indisponibilité/surcharge probable, pas une preuve de clé invalide.':r.status===429?'Limite de débit ou quota atteint.':r.status===401||r.status===403?'Vérifier la clé API et ses autorisations.':'Consulter le message renvoyé par le fournisseur.'};
   const content=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
   if(!content)return {provider:p.name,model:p.model,ok:false,status:r.status,latencyMs:Date.now()-start,timeoutBudgetMs:timeout,attempts,code:'EMPTY_RESPONSE',error:'Réponse vide.'};
   try{return {provider:p.name,model:p.model,ok:true,status:r.status,latencyMs:Date.now()-start,timeoutBudgetMs:timeout,attempts,result:parseJson(content)};}
   catch(e){return {provider:p.name,model:p.model,ok:false,status:r.status,latencyMs:Date.now()-start,timeoutBudgetMs:timeout,attempts,code:'INVALID_JSON',error:'JSON invalide.'};}
  }
  return {provider:p.name,model:p.model,ok:false,status:0,latencyMs:Date.now()-start,timeoutBudgetMs:timeout,attempts,code:'TIMEOUT',error:'Budget total de réponse dépassé.',diagnostic:'Le fournisseur n’a pas répondu dans le budget total autorisé.'};
 }catch(e){
  const timedOut=e.name==='TimeoutError'||e.name==='AbortError';
  return {provider:p.name,model:p.model,ok:false,status:0,latencyMs:Date.now()-start,timeoutBudgetMs:timeout,attempts,code:timedOut?'TIMEOUT':'NETWORK_ERROR',error:timedOut?'Le fournisseur n’a pas répondu dans le budget total autorisé.':clean(e.message||'Erreur réseau',180),diagnostic:'Échec réseau pendant l’appel fournisseur.'};
 }
}
export async function handler(event){if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});let body;try{body=JSON.parse(event.body||'{}');}catch(e){return json(400,{error:'JSON invalide.'});}let ctx;try{ctx=await verifyBearerUser(event);await assertActiveSession(ctx);}catch(e){return json(e.statusCode||401,{error:e.message||'Session invalide.'});}try{if(await rpc(ctx.base,ctx.service,'aurevia_is_admin',{p_user_id:ctx.user.id})!==true)return json(403,{error:'Accès administrateur refusé.'});}catch(e){return json(503,{error:'Vérification administrateur indisponible.'});}if(!allowed(ctx.user.id))return json(429,{error:'Deux lancements maximum par minute.'});const instrument=String(body.instrument||'').toUpperCase();if(!ALLOWED.has(instrument))return json(400,{error:'Instrument non autorisé.'});if(!getMarketStatus(instrument).tradable)return json(409,{error:'Marché fermé pour le week-end.',code:'MARKET_CLOSED'});const key=process.env.TWELVEDATA_API_KEY;if(!key)return json(503,{error:'Twelve Data non configuré.'});const url=new URL('https://api.twelvedata.com/time_series');url.searchParams.set('symbol',instrument);url.searchParams.set('interval','15min');url.searchParams.set('outputsize','60');url.searchParams.set('timezone','UTC');url.searchParams.set('apikey',key);let candles;try{const r=await fetch(url,{signal:AbortSignal.timeout(9000)});const d=await r.json().catch(()=>({}));if(!r.ok||d.status==='error'||!Array.isArray(d.values))return json(502,{error:'Données M15 Twelve Data indisponibles.'});candles=d.values.map(v=>({time:v.datetime,open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:v.volume==null?null:Number(v.volume)})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).reverse();}catch(e){return json(502,{error:'Erreur de récupération des données M15.'});}if(candles.length<30)return json(502,{error:'Historique M15 insuffisant.'});const system='AUREVIA COPILOT. Réponds en français et uniquement en JSON valide. Analyse les bougies OHLC M15 sans inventer d’indicateurs absents. Aucun ordre ne sera exécuté. Décide BUY, SELL ou WAIT. JSON: {decision:"BUY|SELL|WAIT",summary,marketReading,noScenarioReason,watchDirectives:[{condition,expectedReaction,confirmation,invalidation}],buy:null|{entry,stopLoss,takeProfits,confirmationScore,reason},sell:null|{entry,stopLoss,takeProfits,confirmationScore,reason},risks:[],missingData:[]}. Le score 0-100 n’est pas une probabilité.';const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify({instrument,decisionTimeframe:'M15',source:'Twelve Data',candles:candles,price:candles[candles.length-1].close})}];const providers=configuredAIProviders();if(!providers.length)return json(503,{error:'Aucun fournisseur IA configuré.'});const results=await Promise.all(providers.map(p=>call(p,messages)));return json(200,{ok:true,instrument:instrument,timeframe:'M15',dataSource:'Twelve Data',candleCount:candles.length,results:results,summary:{configured:providers.length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,fastest:results.filter(x=>x.ok).sort((a,b)=>a.latencyMs-b.latencyMs)[0] ? results.filter(x=>x.ok).sort((a,b)=>a.latencyMs-b.latencyMs)[0].provider : null},notice:'Benchmark réservé aux administrateurs. Clés API conservées côté serveur.'});}

// Redeploy marker: refresh server-side environment variables for benchmark validation.
