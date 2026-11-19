import { configuredAIProviders } from './_ai-provider.mjs';
import {validateM5AIConsensus} from '../../m5-entry-validation.js';

const clean=(v,n=900)=>String(v??'').replace(/[\\r\\n\\t]+/g,' ').slice(0,n);
const clamp=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(100,Math.round(Number(v)))):null;
function parseJson(s){
 const raw=String(s||'').trim().replace(/^\uFEFF/,'').replace(/^\x60{3}(?:json)?\\s*/i,'').replace(/\\s*\x60{3}$/,'');
 const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
 if(a<0||b<a)throw new Error('Réponse JSON inexploitable.');
 return JSON.parse(raw.slice(a,b+1));
}
const CANDLE_HISTORY_SIZE=250;
const PRIORITY_FIELDS=['trend','bias','direction','ema20','ema50','ema100','ema200','rsi','rsi14','macd','bollinger','atr','adx','bos','choch','breaks','sweeps','supports','resistances','orderBlocks','order_blocks','fvgs','liquidity','poc','vah','val','hvn','lvn','lastCandleTime','available','freshness','asOf','usableForDirectionalBias'];
function boundedValue(value,{depth=0,maxDepth=2,arrayLimit=5,stringLimit=420}={}){
 if(value==null||typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string')return value.slice(0,stringLimit);
 if(depth>=maxDepth)return undefined;
 if(Array.isArray(value))return value.slice(-arrayLimit).map(v=>boundedValue(v,{depth:depth+1,maxDepth,arrayLimit,stringLimit})).filter(v=>v!==undefined);
 if(typeof value==='object'){
  const keys=Object.keys(value),ordered=[...PRIORITY_FIELDS.filter(k=>Object.hasOwn(value,k)),...keys.filter(k=>!PRIORITY_FIELDS.includes(k))].slice(0,18);
  const out={};for(const key of ordered){const item=boundedValue(value[key],{depth:depth+1,maxDepth,arrayLimit,stringLimit});if(item!==undefined)out[key]=item;}return out;
 }
 return undefined;
}
function compactCandleHistory(candles,{precision=7,withTimestamps=true}={}){
 if(!Array.isArray(candles)||candles.length!==CANDLE_HISTORY_SIZE)throw Object.assign(new Error('Historique M30 incomplet : 250 bougies sont obligatoires.'),{code:'M30_HISTORY_INCOMPLETE'});
 const rows=[];let previousTime=null;
 for(const candle of candles){
  const tRaw=Array.isArray(candle)?candle[0]:candle?.t;
  const time=typeof tRaw==='number'?(tRaw>1e12?Math.floor(tRaw/1000):Math.floor(tRaw)):Math.floor(Date.parse(tRaw)/1000);
  const values=Array.isArray(candle)?candle.slice(1,5):[candle?.o,candle?.h,candle?.l,candle?.c];
  const nums=values.map(v=>Number.isFinite(Number(v))?Number(Number(v).toPrecision(precision)):NaN);
  if(!Number.isFinite(time)||nums.some(v=>!Number.isFinite(v))||nums[1]<Math.max(nums[0],nums[3])||nums[2]>Math.min(nums[0],nums[3]))throw Object.assign(new Error('Bougie M30 invalide dans le contexte IA.'),{code:'M30_CANDLE_INVALID'});
  const timeField=withTimestamps?(previousTime===null?time:time-previousTime):undefined;
  if(previousTime!==null&&time<=previousTime)throw Object.assign(new Error('Horodatages M30 non croissants.'),{code:'M30_CANDLE_ORDER_INVALID'});
  rows.push(withTimestamps?[timeField,...nums]:nums);previousTime=time;
 }
 return rows;
}
function compactCriticPayload(data,aggressive=false){
 const market=data.marketSummary||{};
 const compactScenario=x=>x&&typeof x==='object'?{
  direction:x.direction,entryZone:boundedValue(x.entryZone,{maxDepth:2,arrayLimit:4,stringLimit:180}),
  entry:x.entry,stopLoss:x.stopLoss,takeProfits:Array.isArray(x.takeProfits)?x.takeProfits.slice(0,3):[],
  reason:String(x.reason||'').slice(0,500)
 }:null;
 const compactAnalysis=x=>x&&typeof x==='object'?{
  decision:x.decision,summary:String(x.summary||'').slice(0,700),
  marketReading:String(x.marketReading||'').slice(0,aggressive?900:1500),
  buy:compactScenario(x.buy),sell:compactScenario(x.sell),
  riskLevel:x.riskLevel,veto:x.veto,vetoReason:String(x.vetoReason||'').slice(0,300),
  criticalBlockers:Array.isArray(x.criticalBlockers)?x.criticalBlockers.slice(0,4):[],
  risks:Array.isArray(x.risks)?x.risks.slice(0,4):[],
  missingData:Array.isArray(x.missingData)?x.missingData.slice(0,4):[]
 }:null;
 return {
  marketSummary:{
   instrument:market.instrument,timeframe:market.timeframe,candleCountM30:market.candleCountM30,
   latestCandles:Array.isArray(market.latestCandles)?market.latestCandles.slice(-12):[],
   indicators:boundedValue(market.indicators,{maxDepth:2,arrayLimit:4,stringLimit:180}),
   structure:boundedValue(market.structure,{maxDepth:2,arrayLimit:4,stringLimit:180}),
   patterns:Array.isArray(market.patterns)?market.patterns.slice(-4).map(x=>String(x).slice(0,160)):[],
   context:{timeframes:boundedValue(market.context?.timeframes,{maxDepth:2,arrayLimit:3,stringLimit:160}),
    macro:market.context?.macro?{dxy:boundedValue(market.context.macro.dxy,{maxDepth:1,arrayLimit:2,stringLimit:120}),notice:String(market.context.macro.notice||'').slice(0,160)}:null}
  },
  groqAnalysis:compactAnalysis(data.groqAnalysis),
  cloudflareIndependentAnalysis:compactAnalysis(data.cloudflareIndependentAnalysis),
  selectedPrimary:data.selectedPrimary
 };
}
export function compactRoleMessages(messages,role,aggressive=false){
 return messages.map(message=>{
  if(message.role==='system'){
   const content=String(message.content||'');
   if(!aggressive)return {...message,content};
   if(role==='groq')return {...message,content:'AUREVIA COPILOT. Analyse en français, JSON valide, aucune invention. Décision BUY/SELL/WAIT fondée sur exactement 250 bougies M30 clôturées fournies sous forme [horodatage epoch ou delta secondes, open, high, low, close], dans l’ordre chronologique. Les horodatages delta sont relatifs à la bougie précédente. M30 est prioritaire; H4/H1/M15 et macro sont des contextes facultatifs, jamais inventés. Étudie tendance, consolidation, BOS/CHoCH, liquidité, supports/résistances, EMA, RSI, MACD, Bollinger et ATR uniquement si fournis. BUY/SELL seulement avec zone de mitigation, entrée, SL structurel et 1-3 TP cohérents; activation après mitigation puis confirmation M5. WAIT si M30 réellement indécis ou données M30 essentielles invalides/périmées. Score 0-100 = confluence, jamais probabilité de gain; facteurs vérifiés pondérés somme 100. estimatedWinRate=null si non démontrable. Aucun ordre exécuté. JSON: {decision:"BUY|SELL|WAIT",summary,marketReading,noScenarioReason,watchDirectives:[{condition,expectedReaction,confirmation,invalidation}],buy,sell,risks:[],missingData:[]}. Scénario: {direction,entryZone:{low,high},entry,stopLoss,takeProfits:[],orderType,triggerPrice,limitPrice,confirmationScore,scoreComponents:[{label,passed,weight,reasoning}],estimatedWinRate,probabilityRationale,reason,humanReasoning,activationConditions:[],entryTrigger,invalidation}.'};
   if(role==='openrouter')return {...message,content:'Tu es le contradicteur indépendant AUREVIA. Compare les deux lectures fournies sans complaisance. Repère contradictions, invalidations, risques et éventuelles erreurs de niveaux. Réponds uniquement en JSON valide, sans inventer de données. Format: {decision:"BUY|SELL|WAIT",verdict:"CONFIRME|NUANCE|CONTESTE",alternativeDecision:"BUY|SELL|WAIT",agreements:[],disagreements:[],criticalBlockers:[],reasoning,marketReadingScore,buyConfirmationScore,sellConfirmationScore,alternativeScenario:null|{direction,entryZone:{low,high},entry,stopLoss,takeProfits:[],reason}}.'};
   return {...message,content:content.length>5000?content.slice(0,3500)+'\n[Instructions compactées]\n'+content.slice(-1200):content};
  }
  let data;try{data=JSON.parse(String(message.content||''));}catch{return {...message,content:String(message.content||'').slice(0,aggressive?2500:6000)};}
  if(role==='openrouter'&&data.marketSummary){
   data=compactCriticPayload(data,aggressive);
  }else if(Array.isArray(data.candles)){
   data.candles=compactCandleHistory(data.candles,{precision:aggressive?7:8,withTimestamps:true});
   if(Array.isArray(data.patterns))data.patterns=data.patterns.slice(aggressive?-5:-8);
   if(aggressive){
    const original=data;
    data={
     instrument:original.instrument,decisionTimeframe:'M30',
     candleEncoding:'250 OHLC M30 candles, chronological. Each row: [first row epoch seconds; later rows delta seconds, open, high, low, close].',
     candles:original.candles,
     indicators:boundedValue(original.indicators,{maxDepth:2,arrayLimit:4,stringLimit:160}),
     structure:boundedValue(original.structure,{maxDepth:2,arrayLimit:4,stringLimit:160}),
     patterns:Array.isArray(original.patterns)?original.patterns.slice(-5):[],
     volumeProfile:boundedValue(original.volumeProfile,{maxDepth:2,arrayLimit:3,stringLimit:120}),
     fibonacci:boundedValue(original.fibonacci,{maxDepth:2,arrayLimit:3,stringLimit:120}),
     price:original.price,previousClose:original.previousClose,
     context:{timeframes:boundedValue(original.context?.timeframes,{maxDepth:2,arrayLimit:3,stringLimit:140}),
      macro:original.context?.macro?{dxy:boundedValue(original.context.macro.dxy,{maxDepth:1,arrayLimit:2,stringLimit:120}),notice:String(original.context.macro.notice||'').slice(0,120)}:null}
    };
   }else if(data.context?.timeframes){
    data.context.timeframes=boundedValue(data.context.timeframes,{maxDepth:3,arrayLimit:4,stringLimit:240});
   }
  }
  return {...message,content:JSON.stringify(data)};
 });
}
function safeProviderError(status,payload){
 const raw=String(payload?.error?.message||payload?.message||'').replace(/[\\r\\n\\t]+/g,' ').replace(/Bearer\\s+\\S+/gi,'Bearer [masqué]').slice(0,140);
 if(status===413)return 'Requête trop volumineuse (HTTP 413)';
 if(status===429)return 'Limite ou quota fournisseur atteint (HTTP 429)';
 if(status===401||status===403)return 'Authentification ou permission refusée (HTTP '+status+')';
 if(status>=500)return 'Erreur temporaire du fournisseur (HTTP '+status+')';
 return 'Requête refusée (HTTP '+status+')'+(raw?' : '+raw:'');
}
async function ask(p,messages,timeout=18000,options={}){
 const aggressive=options.aggressive===true;
 const selected=compactRoleMessages(messages,p.id,aggressive);
 const body={model:p.model,messages:selected,temperature:0.2,stream:false};
 if(p.id==='groq'){
  body.max_completion_tokens=aggressive?1200:1800;
  if(p.model.startsWith('openai/gpt-oss-')){body.reasoning_effort='low';body.include_reasoning=false;body.response_format={type:'json_object'};}
 }else if(p.id==='cloudflare'){body.max_tokens=aggressive?1200:1600;}
 else {body.max_tokens=aggressive?2400:1800;if(p.id==='openrouter')body.response_format={type:'json_object'};}
 const headers={authorization:'Bearer '+p.key,'content-type':'application/json'};
 if(p.id==='openrouter'){headers['HTTP-Referer']='https://aurevia-copilot-ia.netlify.app';headers['X-Title']='AUREVIA COPILOT';}
 const serialized=JSON.stringify(body);
 const started=Date.now();
 let r;
 try{
  r=await fetch(p.url,{method:'POST',headers,body:serialized,signal:AbortSignal.timeout(timeout)});
 }catch(e){
  const causeCode=String(e?.cause?.code||e?.cause?.errno||'').slice(0,80)||null;
  const errorName=String(e?.name||'Error').slice(0,80);
  const timedOut=errorName==='TimeoutError'||errorName==='AbortError'||causeCode==='ETIMEDOUT';
  const networkDiagnostics={kind:timedOut?'TIMEOUT':'NETWORK_FAILURE',errorName,causeCode,elapsedMs:Date.now()-started,timeoutMs:timeout};
  throw Object.assign(new Error(p.name+' '+(timedOut?'délai dépassé':'erreur réseau')+(causeCode?' ('+causeCode+')':'')),{code:timedOut?'PROVIDER_TIMEOUT':'PROVIDER_NETWORK_ERROR',networkDiagnostics});
 }
 const j=await r.json().catch(()=>({}));
 const diagnostics={requestBytes:Buffer.byteLength(serialized,'utf8'),responseBytes:Buffer.byteLength(JSON.stringify(j),'utf8'),httpStatus:r.status,latencyMs:Date.now()-started,compacted:aggressive};
 if(!r.ok)throw Object.assign(new Error(safeProviderError(r.status,j)),{providerStatus:r.status,diagnostics});
 const choice=j?.choices?.[0],message=choice?.message;
 const extractText=value=>typeof value==='string'?value:Array.isArray(value)?value.map(part=>typeof part==='string'?part:(part?.text||part?.content||'')).join('\\n'):'';
 const content=extractText(message?.content)||extractText(choice?.text)||extractText(j?.output_text);
 const reasoning=[extractText(message?.reasoning),extractText(message?.reasoning_details),extractText(message?.analysis)].filter(Boolean).join('\\n');
 const output=content.trim()?content:reasoning.trim();
 if(!output.trim())throw Object.assign(new Error(p.name+' réponse vide (finish_reason: '+String(choice?.finish_reason||'inconnu')+')'),{code:'EMPTY_PROVIDER_RESPONSE',diagnostics:{...diagnostics,finishReason:choice?.finish_reason||null,hasReasoning:Boolean(reasoning),choiceCount:Array.isArray(j?.choices)?j.choices.length:0,hasMessage:Boolean(message)}});
 try{return {...parseJson(output),_providerDiagnostics:{...diagnostics,contentSource:content.trim()?'content':'reasoning'}};}
 catch(e){throw Object.assign(new Error(p.name+' réponse non JSON exploitable'),{code:'INVALID_PROVIDER_JSON',diagnostics});}
}

const base='Tu es une IA d’AUREVIA COPILOT. Réponds en français et en JSON valide. N’invente aucun cours, indicateur, niveau ni donnée absente. BUY, SELL ou WAIT sont les seules décisions. Les scores sur 100 mesurent la qualité de lecture/confluence, jamais une probabilité de gain.';
const dir=x=>['BUY','SELL','WAIT'].includes(String(x?.decision||'').toUpperCase())?String(x.decision).toUpperCase():'WAIT';
const arr=x=>Array.isArray(x)?x.slice(0,10).map(v=>clean(v,240)).filter(Boolean):[];
export async function runAureviaCollaboration({messages}){
 const ps=Object.fromEntries(configuredAIProviders().map(p=>[p.id,p]));
 const groq=ps.groq,openrouter=ps.openrouter,cloudflare=ps.cloudflare;
 if(!cloudflare)throw Object.assign(new Error('Cloudflare est indispensable comme contrôleur indépendant et solution de secours, mais n’est pas configuré.'),{code:'CLOUDFLARE_NOT_CONFIGURED'});
 const raw=messages.find(m=>m.role==='user')?.content||'{}';let market={};try{market=JSON.parse(raw);}catch{}
 const candleCountM30=Array.isArray(market.candles)?market.candles.length:0;
 const info={instrument:market.instrument||null,candleCountM30};
 if(candleCountM30!==250)throw Object.assign(new Error('Le pipeline IA exige exactement 250 bougies M30.'),{code:'M30_HISTORY_INCOMPLETE',receivedCandleCountM30:candleCountM30,requiredCandleCountM30:250});
 const results={groq:null,openrouter:null,cloudflare:null};
 const runTimed=async(provider,role,call)=>{
  const started=Date.now();
  try{const result=await call();return {ok:true,provider:provider.name,model:provider.model,role,inputCandleCountM30:candleCountM30,latencyMs:Date.now()-started,...result};}
  catch(e){return {ok:false,provider:provider.name,model:provider.model,role,error:clean(e?.message||'Erreur fournisseur',180),code:e?.code||null,networkDiagnostics:e?.networkDiagnostics||null,diagnostics:e?.diagnostics||null,latencyMs:Date.now()-started,inputCandleCountM30:candleCountM30};}
 };
 // Deux lectures indépendantes sur le même historique : elles s'exécutent en parallèle.
 const analysisStarted=Date.now();
 const PRIMARY_TIMEOUT_MS=8500,CLOUDFLARE_TIMEOUT_MS=11500,CRITIC_TIMEOUT_MS=7000,RETRY_TIMEOUT_MS=3500,MAX_ANALYSIS_BUDGET_MS=25000;
 const [groqResult,cloudflareResult]=await Promise.all([
  groq?runTimed(groq,'ANALYSTE_PRINCIPAL',async()=>{try{return await ask(groq,messages,PRIMARY_TIMEOUT_MS);}catch(e){if(e?.providerStatus!==413)return Promise.reject(e);const remaining=MAX_ANALYSIS_BUDGET_MS-(Date.now()-analysisStarted);if(remaining<RETRY_TIMEOUT_MS)throw e;return await ask(groq,messages,Math.min(RETRY_TIMEOUT_MS,remaining),{aggressive:true});}}):
   Promise.resolve({ok:false,provider:'Groq',role:'ANALYSTE_PRINCIPAL',error:'Non configuré',inputCandleCountM30:candleCountM30}),
  runTimed(cloudflare,'CONTROLE_INDEPENDANT',async()=>ask(cloudflare,[
   {role:'system',content:base+' Tu es le contrôleur indépendant AUREVIA. Effectue ta propre lecture des 250 bougies M30 et des contextes fournis, sans copier une conclusion externe. Identifie biais, structure, zones, invalidations et risques. Tu dois aussi pouvoir servir d’analyste de secours si Groq échoue. JSON: {decision,summary,marketReading,marketReadingScore,marketReadingFactors,buy,sell,riskLevel:"LOW|MODERATE|HIGH|CRITICAL",veto:false,vetoReason,criticalBlockers:[],risks:[],missingData:[],agreements:[],disagreements:[],noScenarioReason,watchDirectives}.'},
   ...messages.filter(m=>m.role!=='system')
  ],CLOUDFLARE_TIMEOUT_MS))
 ]);
 results.groq=groqResult;results.cloudflare=cloudflareResult;
 const groqOk=groqResult.ok,cloudflareOk=cloudflareResult.ok;
 if(!groqOk&&!cloudflareOk)throw Object.assign(new Error('Groq et Cloudflare sont indisponibles : aucune analyse fiable ne peut être produite.'),{code:'AI_PRIMARY_AND_FALLBACK_FAILED',attempts:[groqResult,cloudflareResult]});
 const lead=groqOk?groqResult:cloudflareResult;
 const leadProvider=groqOk?groq:cloudflare;
 const leadRole=groqOk?'ANALYSTE_PRINCIPAL':'ANALYSTE_SECOURS';
 if(openrouter){
  results.openrouter=await runTimed(openrouter,'ANALYSTE_CONTREDICTEUR',async()=>{const criticMessages=[
   {role:'system',content:base+' Tu es l’analyste contradicteur. Compare les analyses indépendantes de Groq et Cloudflare lorsqu’elles existent. Recherche faiblesses, contradictions, confirmations, invalidations et risques. Ne valide pas par complaisance. JSON: {decision,verdict:"CONFIRME|NUANCE|CONTESTE",alternativeDecision:"BUY|SELL|WAIT",agreements:[],disagreements:[],criticalBlockers:[],reasoning,marketReadingScore,buyConfirmationScore,sellConfirmationScore,alternativeScenario:null|{direction,entryZone:{low,high},entry,stopLoss,takeProfits:[],reason}}.'},
   {role:'user',content:JSON.stringify({marketSummary:{instrument:market.instrument,timeframe:market.timeframe,candleCountM30,latestCandles:(market.candles||[]).slice(-12).map(c=>[c.t,c.o,c.h,c.l,c.c]),indicators:market.indicators,structure:market.structure,patterns:(market.patterns||[]).slice(-5),context:{timeframes:market.context?.timeframes,macro:market.context?.macro?{dxy:market.context.macro.dxy,notice:market.context.macro.notice}:null}},groqAnalysis:groqOk?{decision:groqResult.decision,summary:String(groqResult.summary||'').slice(0,1200),marketReading:String(groqResult.marketReading||'').slice(0,4500),buy:groqResult.buy?{direction:groqResult.buy.direction,entryZone:groqResult.buy.entryZone,entry:groqResult.buy.entry,stopLoss:groqResult.buy.stopLoss,takeProfits:groqResult.buy.takeProfits,reason:String(groqResult.buy.reason||'').slice(0,900)}:null,sell:groqResult.sell?{direction:groqResult.sell.direction,entryZone:groqResult.sell.entryZone,entry:groqResult.sell.entry,stopLoss:groqResult.sell.stopLoss,takeProfits:groqResult.sell.takeProfits,reason:String(groqResult.sell.reason||'').slice(0,900)}:null,risks:groqResult.risks,missingData:groqResult.missingData}:null,cloudflareIndependentAnalysis:cloudflareOk?{decision:cloudflareResult.decision,summary:String(cloudflareResult.summary||'').slice(0,1200),marketReading:String(cloudflareResult.marketReading||'').slice(0,4500),buy:cloudflareResult.buy?{direction:cloudflareResult.buy.direction,entryZone:cloudflareResult.buy.entryZone,entry:cloudflareResult.buy.entry,stopLoss:cloudflareResult.buy.stopLoss,takeProfits:cloudflareResult.buy.takeProfits,reason:String(cloudflareResult.buy.reason||'').slice(0,900)}:null,sell:cloudflareResult.sell?{direction:cloudflareResult.sell.direction,entryZone:cloudflareResult.sell.entryZone,entry:cloudflareResult.sell.entry,stopLoss:cloudflareResult.sell.stopLoss,takeProfits:cloudflareResult.sell.takeProfits,reason:String(cloudflareResult.sell.reason||'').slice(0,900)}:null,riskLevel:cloudflareResult.riskLevel,veto:cloudflareResult.veto,vetoReason:cloudflareResult.vetoReason,criticalBlockers:cloudflareResult.criticalBlockers,risks:cloudflareResult.risks,missingData:cloudflareResult.missingData}:null,selectedPrimary:leadRole})}
  ];const remaining=MAX_ANALYSIS_BUDGET_MS-(Date.now()-analysisStarted);if(remaining<1500)throw Object.assign(new Error('Budget temps restant insuffisant pour la contre-analyse OpenRouter.'),{code:'ANALYSIS_TIME_BUDGET'});try{return await ask(openrouter,criticMessages,Math.min(CRITIC_TIMEOUT_MS,remaining));}catch(e){if(!['EMPTY_PROVIDER_RESPONSE','INVALID_PROVIDER_JSON'].includes(e?.code))throw e;const retryRemaining=MAX_ANALYSIS_BUDGET_MS-(Date.now()-analysisStarted);if(retryRemaining<1500)throw e;return await ask(openrouter,criticMessages,Math.min(RETRY_TIMEOUT_MS,retryRemaining),{aggressive:true});}});
 }else results.openrouter={ok:false,provider:'OpenRouter',role:'ANALYSTE_CONTREDICTEUR',error:'Non configuré',inputCandleCountM30:candleCountM30};
 const audit=cloudflareOk?cloudflareResult:null,critic=results.openrouter?.ok?results.openrouter:null;
 const blockers=[...(audit?.criticalBlockers||[]),...(critic?.criticalBlockers||[])].map(x=>clean(x,240)).filter(Boolean);
 let decision=dir(lead),reason='Analyse principale conservée après les contrôles disponibles.';
 if(audit?.veto===true||audit?.riskLevel==='CRITICAL'){decision='WAIT';reason='WAIT : veto du contrôle indépendant Cloudflare — '+clean(audit.vetoReason||'risque critique',220);}
 else if(blockers.length){decision='WAIT';reason='WAIT : points critiques relevés — '+blockers.slice(0,3).join(' · ');}
 else if(critic?.verdict==='CONTESTE'&&['BUY','SELL'].includes(dir(lead))&&dir(critic)!==dir(lead)){decision=dir(critic)==='WAIT'?'WAIT':dir(critic);reason='Scénario principal contesté par OpenRouter après comparaison indépendante.';}
 const providers={groq:groqResult,openrouter:results.openrouter,cloudflare:cloudflareResult};
 const allThree=Boolean(groqOk&&results.openrouter?.ok&&cloudflareOk);
 const fallbackUsed=!groqOk||!results.openrouter?.ok||!cloudflareOk;
 return {data:{...lead,decision,collaboration:{mode:'PARALLEL_PRIMARY_AND_INDEPENDENT_REVIEW',...info,providerOrder:['Groq + Cloudflare en parallèle','OpenRouter en contradiction'],primaryProvider:leadProvider.name,primaryRole:leadRole,providers,allThreeResponded:allThree,fallbackUsed,decisionBeforeReview:dir(lead),decisionAfterReview:decision,synthesisReason:reason,agreements:critic?.agreements||[],disagreements:critic?.disagreements||[],criticalBlockers:blockers,independentCloudflareDecision:audit?dir(audit):null,marketReadingScore:clamp(lead.marketReadingScore),marketReadingFactors:arr(lead.marketReadingFactors),buyConfirmationScore:clamp(lead.buy?.confirmationScore),sellConfirmationScore:clamp(lead.sell?.confirmationScore),disclaimer:'Groq et Cloudflare analysent indépendamment les 250 bougies M30 en parallèle ; OpenRouter confronte leurs résultats. Les scores sont qualitatifs et non des probabilités. Toute indisponibilité fournisseur dégrade la collaboration.'}},provider:'AUREVIA · 3 IA',model:leadProvider.model,attempts:Object.values(providers).filter(x=>x&&!x.ok)};
}

export async function runAureviaM5Confirmation({scenario, candles, indicators, structure}) {
 const ps=Object.fromEntries(configuredAIProviders().map(p=>[p.id,p]));
 const groq=ps.groq,openrouter=ps.openrouter,cloudflare=ps.cloudflare;
 if(!groq||!openrouter||!cloudflare) return {confirmed:false,score:0,reason:'Analyse M5 suspendue : les trois IA (Groq, OpenRouter et Cloudflare) doivent être disponibles.',providerStatus:{groq:Boolean(groq),openrouter:Boolean(openrouter),cloudflare:Boolean(cloudflare)}};
 if(!Array.isArray(candles)||candles.length<35)return {confirmed:false,score:0,reason:'Historique M5 insuffisant : 35 bougies clôturées sont nécessaires.'};
 const market={scenario,candles:candles.slice(-40),indicators,structure};
 const m5Base='Tu es une IA d’AUREVIA COPILOT. Réponds en français et en JSON valide. Pour cette analyse M5, CONFIRM et WAIT sont les seules décisions autorisées. Les scores sur 100 mesurent la qualité de confluence, jamais une probabilité de gain. N’invente aucun cours, indicateur ni niveau absent.';
 const system=m5Base+' Tu es l’analyste principal M5 d’AUREVIA. Tu analyses uniquement les bougies M5 clôturées fournies et le scénario M30 déjà défini. Ne modifies jamais le sens du scénario. Tu dois déterminer si une entrée raisonnable existe maintenant. Propose un prix d’entrée précis, ou WAIT si aucune entrée raisonnable. Le prix doit être appuyé par la structure, une zone de retest, une liquidité reprise ou une impulsion; ne recopie pas simplement la clôture de la dernière bougie. Ne propose jamais un prix hors de la zone M30 ou au-delà du SL/TP1. JSON: {decision:"CONFIRM|WAIT",entryPrice:null|number,entryZoneLow:null|number,entryZoneHigh:null|number,score:0-100,reasoning,structureEvidence:[],liquidityEvidence:[],riskNotes:[],invalidation}.';
 let lead,review,audit;
 try { lead=await ask(groq,[{role:'system',content:system},{role:'user',content:JSON.stringify(market)}],6500); }
 catch(e){return {confirmed:false,score:0,reason:'Groq indisponible : aucune entrée M5 proposée. '+clean(e.message,160)};}
 const criticSystem=m5Base+' Tu es l’analyste contradicteur M5. Réévalue indépendamment le prix d’entrée proposé par Groq à partir des mêmes bougies et du scénario M30. Ne valide pas par complaisance. Réponds WAIT si le prix est trop tardif, hors zone, non justifié ou incohérent avec SL/TP1. JSON: {decision:"CONFIRM|WAIT",entryPrice:null|number,score:0-100,verdict:"CONFIRME|CONTESTE",reasoning,criticalBlockers:[]}.';
 const controlSystem=m5Base+' Tu es le contrôleur indépendant M5. Vérifie indépendamment la sécurité du même prix proposé par Groq, la cohérence BUY/SELL, la zone M30, le SL, TP1, la fraîcheur des bougies et les risques de poursuite tardive. Tu disposes d’un veto. Ne te fie pas à une autre IA. JSON: {decision:"CONFIRM|WAIT",veto:false,vetoReason,score:0-100,reasoning,criticalBlockers:[]}.';
 const [reviewResult,auditResult]=await Promise.allSettled([
  ask(openrouter,[{role:'system',content:criticSystem},{role:'user',content:JSON.stringify({market,primaryProposal:lead})}],6500),
  ask(cloudflare,[{role:'system',content:controlSystem},{role:'user',content:JSON.stringify({market,primaryProposal:lead})}],6500)
 ]);
 if(reviewResult.status!=='fulfilled')return {confirmed:false,score:0,reason:'OpenRouter indisponible : contre-analyse M5 incomplète. '+clean(reviewResult.reason?.message||reviewResult.reason,160)};
 if(auditResult.status!=='fulfilled')return {confirmed:false,score:0,reason:'Cloudflare indisponible : contrôle de risque M5 incomplet. '+clean(auditResult.reason?.message||auditResult.reason,160)};
 review=reviewResult.value;audit=auditResult.value;
 const result=validateM5AIConsensus({scenario,lead,review,audit,atr:indicators?.atr14});
 return {...result,lastCandleAt:new Date(candles.at(-1).time+5*60000).toISOString(),providers:{groq:groq.name,openrouter:openrouter.name,cloudflare:cloudflare.name},proposal:lead,review,audit};
}
