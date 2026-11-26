import { configuredAIProviders } from './_ai-provider.mjs';
import {validateM5AIConsensus} from '../../m5-entry-validation.js';

const clean=(v,n=900)=>String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,n);
const clamp=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(100,Math.round(Number(v)))):null;
export function parseJson(s){
 const raw=String(s||'').trim().replace(/^\uFEFF/,'').replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,'');
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
   indicators:boundedValue(market.indicators,{maxDepth:3,arrayLimit:4,stringLimit:180}),
   structure:boundedValue(market.structure,{maxDepth:3,arrayLimit:4,stringLimit:180}),
   patterns:Array.isArray(market.patterns)?market.patterns.slice(-4).map(x=>String(x).slice(0,160)):[],
   context:{timeframes:boundedValue(market.context?.timeframes,{maxDepth:3,arrayLimit:3,stringLimit:160}),
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
   if(role==='openrouter'||role==='gemini'||role==='zai')return {...message,content:'Tu es un analyste indépendant AUREVIA COPILOT. Analyse directement les 250 bougies M30 et tous les contextes fournis. N’attends pas les autres IA et ne prétends pas les avoir comparées. Donne ton biais, ta lecture structurelle, les zones, invalidations et risques. Cherche activement les raisons de contredire un BUY/SELL fragile. Réponds en français et uniquement en JSON valide, sans inventer de données. Format: {decision:"BUY|SELL|WAIT",verdict:"CONFIRME|NUANCE|CONTESTE",alternativeDecision:"BUY|SELL|WAIT",summary,marketReading,agreements:[],disagreements:[],criticalBlockers:[],reasoning,marketReadingScore,buyConfirmationScore,sellConfirmationScore,alternativeScenario:null|{direction,entryZone:{low,high},entry,stopLoss,takeProfits:[],reason}}.'};
   return {...message,content:content.length>5000?content.slice(0,3500)+'\n[Instructions compactées]\n'+content.slice(-1200):content};
  }
  let data;try{data=JSON.parse(String(message.content||''));}catch{return {...message,content:String(message.content||'').slice(0,aggressive?2500:6000)};}
  if(role==='openrouter'&&data.marketSummary){
   data=compactCriticPayload(data,aggressive);
  }else if(Array.isArray(data.candles)){
   // La requête initiale Cloudflare garde le schéma OHLC objet. Seul le retry Groq utilise les tuples.
   if(role==='groq'&&aggressive){
    data.candles=compactCandleHistory(data.candles,{precision:7,withTimestamps:true});
    const original=data;
    data={
     instrument:original.instrument,decisionTimeframe:'M30',
     candleEncoding:'Exactly 250 chronological M30 OHLC candles. Row 1: [epoch seconds, open, high, low, close]. Following rows: [delta seconds from prior candle, open, high, low, close].',
     candles:original.candles,
     indicators:boundedValue(original.indicators,{maxDepth:3,arrayLimit:4,stringLimit:160}),
     structure:boundedValue(original.structure,{maxDepth:3,arrayLimit:4,stringLimit:160}),
     patterns:Array.isArray(original.patterns)?original.patterns.slice(-5):[],
     volumeProfile:boundedValue(original.volumeProfile,{maxDepth:2,arrayLimit:3,stringLimit:120}),
     fibonacci:boundedValue(original.fibonacci,{maxDepth:2,arrayLimit:3,stringLimit:120}),
     price:original.price,previousClose:original.previousClose,
     context:{timeframes:boundedValue(original.context?.timeframes,{maxDepth:3,arrayLimit:3,stringLimit:140}),
      macro:original.context?.macro?{dxy:boundedValue(original.context.macro.dxy,{maxDepth:1,arrayLimit:2,stringLimit:120}),notice:String(original.context.macro.notice||'').slice(0,120)}:null}
    };
   }else{
    if(Array.isArray(data.patterns))data.patterns=data.patterns.slice(-5);
    data.indicators=boundedValue(data.indicators,{maxDepth:3,arrayLimit:5,stringLimit:220});
    data.structure=boundedValue(data.structure,{maxDepth:3,arrayLimit:5,stringLimit:220});
    data.patterns=boundedValue(data.patterns,{maxDepth:2,arrayLimit:4,stringLimit:160});
    data.volumeProfile=boundedValue(data.volumeProfile,{maxDepth:2,arrayLimit:3,stringLimit:120});
    data.fibonacci=boundedValue(data.fibonacci,{maxDepth:2,arrayLimit:3,stringLimit:120});
    data.context=boundedValue(data.context,{maxDepth:3,arrayLimit:4,stringLimit:180});
   }
  }
  return {...message,content:JSON.stringify(data)};
 });
}
function safeProviderError(status,payload){
 const raw=String(payload?.error?.message||payload?.message||'').replace(/[\r\n\t]+/g,' ').replace(/Bearer\\s+\\S+/gi,'Bearer [masqué]').slice(0,140);
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
  body.max_completion_tokens=aggressive?2200:1800;
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
 const responseText=await r.text();
 let j={};try{j=JSON.parse(responseText);}catch{}
 const diagnostics={requestBytes:Buffer.byteLength(serialized,'utf8'),responseBytes:Buffer.byteLength(responseText,'utf8'),httpStatus:r.status,contentType:r.headers.get('content-type')||null,latencyMs:Date.now()-started,compacted:aggressive,responseIsJson:Boolean(responseText.trim().startsWith('{')||responseText.trim().startsWith('['))};
 if(!r.ok)throw Object.assign(new Error(safeProviderError(r.status,j)),{providerStatus:r.status,diagnostics});
 if(!diagnostics.responseIsJson)throw Object.assign(new Error(p.name+' réponse HTTP non JSON'),{code:'NON_JSON_PROVIDER_RESPONSE',diagnostics});
 const choice=j?.choices?.[0],message=choice?.message;
 const extractText=value=>{
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(part=>typeof part==='string'?part:extractText(part?.text??part?.content??part?.summary??'')).filter(Boolean).join('\n');
  if(value&&typeof value==='object')return extractText(value.text??value.content??value.summary??'');
  return '';
 };
 const content=extractText(message?.content)||extractText(choice?.text)||extractText(j?.output_text)||extractText(j?.output);
 const reasoning=[extractText(message?.reasoning),extractText(message?.reasoning_details),extractText(message?.analysis),extractText(j?.reasoning),extractText(j?.reasoning_details)].filter(Boolean).join('\n');
 const output=content.trim()?content:reasoning.trim();
 if(!output.trim())throw Object.assign(new Error(p.name+' réponse vide (finish_reason: '+String(choice?.finish_reason||'inconnu')+')'),{code:choice?.finish_reason==='length'?'OUTPUT_TRUNCATED':'EMPTY_PROVIDER_RESPONSE',diagnostics:{...diagnostics,finishReason:choice?.finish_reason||null,hasReasoning:Boolean(reasoning),choiceCount:Array.isArray(j?.choices)?j.choices.length:0,hasMessage:Boolean(message),contentLength:content.length,reasoningLength:reasoning.length}});
 try{return {...parseJson(output),_providerDiagnostics:{...diagnostics,contentSource:content.trim()?'content':'reasoning'}};}
 catch(e){throw Object.assign(new Error(p.name+' réponse non JSON exploitable'),{code:choice?.finish_reason==='length'?'OUTPUT_TRUNCATED':'INVALID_PROVIDER_JSON',diagnostics:{...diagnostics,finishReason:choice?.finish_reason||null,outputLength:output.length}});}
}

const base='Tu es une IA d’AUREVIA COPILOT. Réponds en français et en JSON valide. N’invente aucun cours, indicateur, niveau ni donnée absente. BUY, SELL ou WAIT sont les seules décisions. Les scores sur 100 mesurent la qualité de lecture/confluence, jamais une probabilité de gain.';
const dir=x=>['BUY','SELL','WAIT'].includes(String(x?.decision||'').toUpperCase())?String(x.decision).toUpperCase():'WAIT';
const arr=x=>Array.isArray(x)?x.slice(0,10).map(v=>clean(v,240)).filter(Boolean):[];
export async function runAureviaCollaboration({messages}){
 const ps=Object.fromEntries(configuredAIProviders().map(p=>[p.id,p]));
 const groq=ps.groq,gemini=ps.gemini,openrouter=ps.openrouter,cloudflare=ps.cloudflare,zai=ps.zai;
 if(!cloudflare)throw Object.assign(new Error('Cloudflare est indispensable comme contrôleur indépendant et solution de secours, mais n’est pas configuré.'),{code:'CLOUDFLARE_NOT_CONFIGURED'});
 const raw=messages.find(m=>m.role==='user')?.content||'{}';let market={};try{market=JSON.parse(raw);}catch{}
 const candleCountM30=Array.isArray(market.candles)?market.candles.length:0;
 const info={instrument:market.instrument||null,candleCountM30};
 if(candleCountM30!==250)throw Object.assign(new Error('Le pipeline IA exige exactement 250 bougies M30.'),{code:'M30_HISTORY_INCOMPLETE',receivedCandleCountM30:candleCountM30,requiredCandleCountM30:250});
 const results={groq:null,gemini:null,openrouter:null,cloudflare:null,zai:null};
 const runTimed=async(provider,role,call)=>{
  const started=Date.now();
  try{const result=await call();return {ok:true,provider:provider.name,model:provider.model,role,inputCandleCountM30:candleCountM30,latencyMs:Date.now()-started,...result};}
  catch(e){return {ok:false,provider:provider.name,model:provider.model,role,error:clean(e?.message||'Erreur fournisseur',180),code:e?.code||null,networkDiagnostics:e?.networkDiagnostics||null,diagnostics:e?.diagnostics||null,latencyMs:Date.now()-started,inputCandleCountM30:candleCountM30};}
 };
 // Deux lectures indépendantes sur le même historique : elles s'exécutent en parallèle.
 const analysisStarted=Date.now();
 const PRIMARY_TIMEOUT_MS=8500,CLOUDFLARE_TIMEOUT_MS=11500,CRITIC_TIMEOUT_MS=7000,RETRY_TIMEOUT_MS=5500,MAX_ANALYSIS_BUDGET_MS=25000;
 const independentRun=(provider,role)=>provider?runTimed(provider,'ANALYSTE_INDEPENDANT_'+role.toUpperCase(),async()=>{
  const independentMessages=[
   {role:'system',content:base+' Tu es un analyste indépendant AUREVIA. Analyse directement les 250 bougies M30 et les contextes fournis, sans attendre ni copier les autres IA. Cherche aussi activement les raisons de contredire un BUY/SELL fragile. Donne ton propre biais, ta lecture structurelle, les zones, invalidations, risques et scénarios. JSON: {decision:"BUY|SELL|WAIT",verdict:"CONFIRME|NUANCE|CONTESTE",alternativeDecision:"BUY|SELL|WAIT",summary,marketReading,agreements:[],disagreements:[],criticalBlockers:[],reasoning,marketReadingScore,buyConfirmationScore,sellConfirmationScore,alternativeScenario:null|{direction,entryZone:{low,high},entry,stopLoss,takeProfits:[],reason}}.'},
   ...messages.filter(m=>m.role!=='system')
  ];
  return await ask(provider,independentMessages,11000);
 }):Promise.resolve({ok:false,provider:provider?.name||role,role:'ANALYSTE_INDEPENDANT',error:'Non configuré',inputCandleCountM30:candleCountM30});
 const openrouterPromise=independentRun(openrouter,'openrouter');
 const geminiPromise=independentRun(gemini,'gemini');
 const zaiPromise=independentRun(zai,'zai');
 const [groqResult,cloudflareResult,openrouterResult,geminiResult,zaiResult]=await Promise.all([
  groq?runTimed(groq,'ANALYSTE_PRINCIPAL',async()=>{try{return await ask(groq,messages,11000);}catch(e){if(e?.providerStatus!==413&&e?.code!=='OUTPUT_TRUNCATED')return Promise.reject(e);return await ask(groq,messages,6500,{aggressive:true});}}):
   Promise.resolve({ok:false,provider:'Groq',role:'ANALYSTE_PRINCIPAL',error:'Non configuré',inputCandleCountM30:candleCountM30}),
  runTimed(cloudflare,'CONTROLE_INDEPENDANT',async()=>{
   const auditMessages=[
    {role:'system',content:base+' Tu es le contrôleur indépendant AUREVIA. Effectue ta propre lecture des 250 bougies M30 et des contextes fournis, sans copier une conclusion externe. Identifie biais, structure, zones, invalidations et risques. Tu dois aussi pouvoir servir d’analyste de secours si Groq échoue. JSON: {decision,summary,marketReading,marketReadingScore,marketReadingFactors,buy,sell,riskLevel:"LOW|MODERATE|HIGH|CRITICAL",veto:false,vetoReason,criticalBlockers:[],risks:[],missingData:[],agreements:[],disagreements:[],noScenarioReason,watchDirectives}.'},
    ...messages.filter(m=>m.role!=='system')
   ];
   try{return await ask(cloudflare,auditMessages,12000);}
   catch(e){if(!['EMPTY_PROVIDER_RESPONSE','INVALID_PROVIDER_JSON','OUTPUT_TRUNCATED'].includes(e?.code)&&e?.providerStatus!==413)throw e;return await ask(cloudflare,auditMessages,6000,{aggressive:true});}
  }),
  openrouterPromise,geminiPromise,zaiPromise
 ]);
 results.groq=groqResult;results.cloudflare=cloudflareResult;results.openrouter=openrouterResult;results.gemini=geminiResult;results.zai=zaiResult;
 const groqOk=groqResult.ok,cloudflareOk=cloudflareResult.ok;
 if(!groqOk&&!cloudflareOk)throw Object.assign(new Error('Groq et Cloudflare sont indisponibles : aucune analyse fiable ne peut être produite.'),{code:'AI_PRIMARY_AND_FALLBACK_FAILED',attempts:[groqResult,cloudflareResult,openrouterResult]});
 const lead=groqOk?groqResult:cloudflareResult;
 const leadProvider=groqOk?groq:cloudflare;
 const leadRole=groqOk?'ANALYSTE_PRINCIPAL':'ANALYSTE_SECOURS';
 const audit=cloudflareOk?cloudflareResult:null,critic=results.openrouter?.ok?results.openrouter:null;
 const independent=[critic,geminiResult.ok?geminiResult:null,zaiResult.ok?zaiResult:null].filter(Boolean);
 const blockers=[...(audit?.criticalBlockers||[]),...independent.flatMap(x=>Array.isArray(x.criticalBlockers)?x.criticalBlockers:[])].map(x=>clean(x,240)).filter(Boolean);
 const agreements=independent.flatMap(x=>Array.isArray(x.agreements)?x.agreements:[]).map(x=>clean(x,240)).filter(Boolean).slice(0,12);
 const disagreements=independent.flatMap(x=>Array.isArray(x.disagreements)?x.disagreements:[]).map(x=>clean(x,240)).filter(Boolean).slice(0,12);
 let decision=dir(lead),reason='Analyse principale conservée après les contrôles disponibles.';
 if(audit?.veto===true||audit?.riskLevel==='CRITICAL'){decision='WAIT';reason='WAIT : veto du contrôle indépendant Cloudflare — '+clean(audit.vetoReason||'risque critique',220);}
 else if(blockers.length){decision='WAIT';reason='WAIT : points critiques relevés — '+blockers.slice(0,3).join(' · ');}
 else if(independent.some(x=>x.verdict==='CONTESTE'&&['BUY','SELL'].includes(dir(lead))&&dir(x)!==dir(lead))){decision='WAIT';reason='WAIT : au moins un analyste indépendant conteste le scénario principal.';}
 const providers={groq:groqResult,gemini:geminiResult,openrouter:results.openrouter,cloudflare:cloudflareResult,zai:zaiResult};
 const allFive=Boolean(groqOk&&geminiResult.ok&&results.openrouter?.ok&&cloudflareOk&&zaiResult.ok);
 const fallbackUsed=Object.values(providers).some(x=>!x?.ok);
 return {data:{...lead,decision,collaboration:{mode:'PARALLEL_PRIMARY_AND_INDEPENDENT_REVIEW',...info,providerOrder:['Groq','Gemini','OpenRouter','Cloudflare','Z.ai · GLM-4.7-Flash'],primaryProvider:leadProvider.name,primaryRole:leadRole,providers,allThreeResponded:Boolean(groqOk&&results.openrouter?.ok&&cloudflareOk),allFiveResponded:allFive,fallbackUsed,decisionBeforeReview:dir(lead),decisionAfterReview:decision,synthesisReason:reason,agreements,disagreements,criticalBlockers:blockers,independentCloudflareDecision:audit?dir(audit):null,marketReadingScore:clamp(lead.marketReadingScore),marketReadingFactors:arr(lead.marketReadingFactors),buyConfirmationScore:clamp(lead.buy?.confirmationScore),sellConfirmationScore:clamp(lead.sell?.confirmationScore),disclaimer:'Groq, Gemini, OpenRouter, Cloudflare et Z.ai analysent indépendamment le même historique de 250 bougies M30 en parallèle. Les points critiques et désaccords directionnels imposent WAIT. Les scores sont qualitatifs et non des probabilités. Toute indisponibilité fournisseur dégrade la collaboration.'}},provider:'AUREVIA · 5 IA',model:leadProvider.model,attempts:Object.values(providers).filter(x=>x&&!x.ok)};
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
