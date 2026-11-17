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
function providerIssue(status, payload){
 const message=String(payload?.error?.message||payload?.message||'').split(String.fromCharCode(10)).join(' ').split(String.fromCharCode(13)).join(' ').slice(0,160);
 const code=status===401||status===403?'AUTH_OR_PERMISSION':status===402?'BILLING_REQUIRED':status===404?'MODEL_OR_ENDPOINT_NOT_FOUND':status===413?'PAYLOAD_TOO_LARGE':status===429?'RATE_LIMIT_OR_QUOTA':status>=500?'PROVIDER_SERVER_ERROR':'HTTP_ERROR';
 return {code,message:message||('HTTP '+status)};
}
async function ask(p,messages,timeout=11000){
 const started=Date.now();
 const body={model:p.model,messages,temperature:0.2,stream:false};
 if(p.id==='groq'){body.max_completion_tokens=1500;if(p.model.startsWith('openai/gpt-oss-')){body.reasoning_effort='low';body.include_reasoning=false;body.response_format={type:'json_object'};}}
 else body.max_tokens=1500;
 const headers={authorization:'Bearer '+p.key,'content-type':'application/json'};
 if(p.id==='openrouter'){headers['HTTP-Referer']='https://aurevia-copilot-ia.netlify.app';headers['X-Title']='AUREVIA COPILOT';}
 try {
  const r=await fetch(p.url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const raw=await r.text();let j={};try{j=JSON.parse(raw)}catch{}
  if(!r.ok){const issue=providerIssue(r.status,j);throw Object.assign(new Error(p.name+' '+issue.code+' (HTTP '+r.status+')'+(issue.message?': '+issue.message:'')),{providerCode:issue.code,httpStatus:r.status,elapsedMs:Date.now()-started,timeoutMs:timeout});}
  const c=j?.choices?.[0]?.message?.content;
  if(typeof c!=='string'||!c.trim())throw Object.assign(new Error(p.name+' réponse vide (HTTP 200)'),{providerCode:'EMPTY_RESPONSE',httpStatus:200,elapsedMs:Date.now()-started,timeoutMs:timeout});
  try{return parseJson(c)}catch(e){throw Object.assign(new Error(p.name+' JSON invalide'),{providerCode:'INVALID_JSON',httpStatus:200,elapsedMs:Date.now()-started,timeoutMs:timeout});}
 } catch(e) {
  if(e.providerCode)throw e;
  const timedOut=e?.name==='TimeoutError'||e?.name==='AbortError';
  throw Object.assign(new Error(timedOut?p.name+' délai dépassé après '+timeout+' ms':p.name+' erreur réseau: '+clean(e?.message||'indisponible',120)),{providerCode:timedOut?'TIMEOUT':'NETWORK_ERROR',elapsedMs:Date.now()-started,timeoutMs:timeout});
 }
}
const base='Tu es une IA d’AUREVIA COPILOT. Réponds en français et en JSON valide. N’invente aucun cours, indicateur, niveau ni donnée absente. BUY, SELL ou WAIT sont les seules décisions. Les scores sur 100 mesurent la qualité de lecture/confluence, jamais une probabilité de gain.';
const dir=x=>['BUY','SELL','WAIT'].includes(String(x?.decision||'').toUpperCase())?String(x.decision).toUpperCase():'WAIT';
const arr=x=>Array.isArray(x)?x.slice(0,10).map(v=>clean(v,240)).filter(Boolean):[];
export async function runAureviaCollaboration({messages}){
 const ps=Object.fromEntries(configuredAIProviders().map(p=>[p.id,p]));
 const groq=ps.groq,openrouter=ps.openrouter,cloudflare=ps.cloudflare;
 if(!cloudflare)throw Object.assign(new Error('Cloudflare est indispensable comme solution de secours, mais n’est pas configuré.'),{code:'CLOUDFLARE_NOT_CONFIGURED'});
 const raw=messages.find(m=>m.role==='user')?.content||'{}';let market={};try{market=JSON.parse(raw);}catch{}
 const info={instrument:market.instrument||null,candleCountM15:Array.isArray(market.candles)?market.candles.length:0,candleHistoryTarget:250,candleHistoryComplete:Array.isArray(market.candles)&&market.candles.length===250};
 const results={groq:null,openrouter:null,cloudflare:null};
 let lead=null,leadProvider=null,leadRole='ANALYSTE_PRINCIPAL';
 if(groq){
  const t=Date.now();try{lead=await ask(groq,messages,11000);leadProvider=groq;results.groq={ok:true,provider:groq.name,model:groq.model,role:'ANALYSTE_PRINCIPAL',latencyMs:Date.now()-t,...lead,inputCandleCountM15:info.candleCountM15,decision:dir(lead)};}
  catch(e){results.groq={ok:false,provider:groq.name,model:groq.model,role:'ANALYSTE_PRINCIPAL',error:clean(e.message,220),errorCode:e.providerCode||'UNKNOWN',httpStatus:e.httpStatus??null,latencyMs:e.elapsedMs??Date.now()-t,timeoutMs:e.timeoutMs??11000,inputCandleCountM15:info.candleCountM15};console.warn('[AUREVIA M15 provider]',JSON.stringify(results.groq));}
 }else results.groq={ok:false,provider:'Groq',role:'ANALYSTE_PRINCIPAL',error:'Non configuré'};
 if(!lead){
  const t=Date.now();try{
   lead=await ask(cloudflare,[{role:'system',content:base+' Groq est indisponible. Tu prends exceptionnellement le rôle d’analyste de secours et dois produire une analyse complète multi-timeframes, les signaux BUY/SELL/WAIT, les scores de lecture du marché, les scénarios chiffrés seulement si justifiés, les risques et les données manquantes. JSON: {decision,summary,marketReading,marketReadingScore,marketReadingFactors,buy,sell,risks,missingData,noScenarioReason,watchDirectives}.'},...messages.filter(m=>m.role!=='system')],12000);
   leadProvider=cloudflare;leadRole='ANALYSTE_SECOURS';results.cloudflare={ok:true,provider:cloudflare.name,model:cloudflare.model,role:leadRole,latencyMs:Date.now()-t,...lead,inputCandleCountM15:info.candleCountM15,decision:dir(lead),fallbackFor:'Groq'};
  }catch(e){results.cloudflare={ok:false,provider:cloudflare.name,model:cloudflare.model,role:'ANALYSTE_SECOURS',error:clean(e.message,220),errorCode:e.providerCode||'UNKNOWN',httpStatus:e.httpStatus??null,latencyMs:e.elapsedMs??Date.now()-t,timeoutMs:e.timeoutMs??12000,inputCandleCountM15:info.candleCountM15};console.warn('[AUREVIA M15 provider]',JSON.stringify(results.cloudflare));throw Object.assign(new Error('Groq et Cloudflare indisponibles : aucune analyse fiable ne peut être produite.'),{code:'AI_PRIMARY_AND_FALLBACK_FAILED',attempts:Object.values(results).filter(Boolean)});}
 }
 if(openrouter){
  const t=Date.now();try{
   const review=await ask(openrouter,[{role:'system',content:base+' Tu es l’ANALYSTE CONTRADICTEUR. Vérifie rigoureusement le raisonnement principal, recherche faiblesses, confirmations, invalidations et contradictions. Propose un scénario alternatif uniquement si les données le justifient. JSON: {decision,verdict:"CONFIRME|NUANCE|CONTESTE",alternativeDecision:"BUY|SELL|WAIT",agreements:[],disagreements:[],criticalBlockers:[],reasoning,marketReadingScore,buyConfirmationScore,sellConfirmationScore,alternativeScenario:null|{direction,entryZone:{low,high},entry,stopLoss,takeProfits:[],reason}}.'},{role:'user',content:JSON.stringify({marketData:market,primaryAnalysis:lead,primaryProvider:leadProvider.name})}],12000);
   results.openrouter={ok:true,provider:openrouter.name,model:openrouter.model,role:'ANALYSTE_CONTREDICTEUR',latencyMs:Date.now()-t,...review,inputCandleCountM15:info.candleCountM15,decision:dir(review),agreements:arr(review.agreements),disagreements:arr(review.disagreements),criticalBlockers:arr(review.criticalBlockers)};
  }catch(e){results.openrouter={ok:false,provider:openrouter.name,model:openrouter.model,role:'ANALYSTE_CONTREDICTEUR',error:clean(e.message,220),errorCode:e.providerCode||'UNKNOWN',httpStatus:e.httpStatus??null,latencyMs:e.elapsedMs??Date.now()-t,timeoutMs:e.timeoutMs??12000,inputCandleCountM15:info.candleCountM15};console.warn('[AUREVIA M15 provider]',JSON.stringify(results.openrouter));}
 }else results.openrouter={ok:false,provider:'OpenRouter',role:'ANALYSTE_CONTREDICTEUR',error:'Non configuré'};
 if(leadProvider!==cloudflare){
  const t=Date.now();try{
   const audit=await ask(cloudflare,[{role:'system',content:base+' Tu es l’ANALYSTE DE CONTRÔLE indépendant et solution de secours. Fais ta propre lecture des données, vérifie les contradictions et risques oubliés, et vérifie la conclusion principale et la critique OpenRouter. Si Groq ou OpenRouter est indisponible, assure la continuité de l’analyse en signalant cette indisponibilité. JSON: {decision,riskLevel:"LOW|MODERATE|HIGH|CRITICAL",veto:false,vetoReason,criticalBlockers:[],risks:[],missingData:[],agreements:[],disagreements:[],reasoning,marketReadingScore,buyConfirmationScore,sellConfirmationScore}.'},{role:'user',content:JSON.stringify({marketData:market,primaryAnalysis:lead,openrouterReview:results.openrouter})}],11000);
   results.cloudflare={ok:true,provider:cloudflare.name,model:cloudflare.model,role:'ANALYSTE_CONTROLE',latencyMs:Date.now()-t,...audit,inputCandleCountM15:info.candleCountM15,decision:dir(audit),criticalBlockers:arr(audit.criticalBlockers),risks:arr(audit.risks),missingData:arr(audit.missingData)};
  }catch(e){results.cloudflare={ok:false,provider:cloudflare.name,model:cloudflare.model,role:'ANALYSTE_CONTROLE',error:clean(e.message,220),errorCode:e.providerCode||'UNKNOWN',httpStatus:e.httpStatus??null,latencyMs:e.elapsedMs??Date.now()-t,timeoutMs:e.timeoutMs??11000,inputCandleCountM15:info.candleCountM15};console.warn('[AUREVIA M15 provider]',JSON.stringify(results.cloudflare));}
 }
 const valid=Object.values(results).filter(x=>x?.ok);
 const blockers=valid.flatMap(x=>x.criticalBlockers||[]).map(x=>clean(x,240)).filter(Boolean);
 const audit=results.cloudflare?.ok?results.cloudflare:null,critic=results.openrouter?.ok?results.openrouter:null;
 let decision=dir(lead),reason='Décision principale conservée après les contrôles disponibles.';
 if(audit?.veto===true||audit?.riskLevel==='CRITICAL'){decision='WAIT';reason='WAIT : veto de contrôle Cloudflare — '+clean(audit.vetoReason||'risque critique',220);}
 else if(blockers.length){decision='WAIT';reason='WAIT : points critiques relevés — '+blockers.slice(0,3).join(' · ');}
 else if(critic?.verdict==='CONTESTE'&&['BUY','SELL'].includes(dir(lead))&&dir(critic)!==dir(lead)){decision=dir(critic)==='WAIT'?'WAIT':dir(critic);reason='Scénario principal contesté par OpenRouter ; décision revue après contre-analyse.';}
 const allThree=Boolean(results.groq?.ok&&results.openrouter?.ok&&results.cloudflare?.ok);
 const fallbackUsed=leadProvider===cloudflare||!results.openrouter?.ok||!results.cloudflare?.ok||!results.groq?.ok;
 return {data:{...lead,decision,collaboration:{mode:'THREE_AI_ROLE_REVIEW',...info,providerOrder:['Groq','OpenRouter','Cloudflare'],primaryProvider:leadProvider.name,primaryRole:leadRole,providers:results,allThreeResponded:allThree,fallbackUsed,decisionBeforeReview:dir(lead),decisionAfterReview:decision,synthesisReason:reason,agreements:critic?.agreements||[],disagreements:critic?.disagreements||[],criticalBlockers:blockers,marketReadingScore:clamp(lead.marketReadingScore),marketReadingFactors:arr(lead.marketReadingFactors),buyConfirmationScore:clamp(lead.buy?.confirmationScore),sellConfirmationScore:clamp(lead.sell?.confirmationScore),disclaimer:'Les scores sont qualitatifs et non des probabilités. Si une IA est indisponible, la synthèse est signalée comme dégradée.'}},provider:'AUREVIA · 3 IA',model:leadProvider.model,attempts:Object.values(results).filter(x=>x&&!x.ok),providerDiagnostics:{...info,providers:Object.fromEntries(Object.entries(results).map(([id,x])=>[id,x?{ok:x.ok,model:x.model||null,errorCode:x.errorCode||null,httpStatus:x.httpStatus??null,latencyMs:x.latencyMs??null,timeoutMs:x.timeoutMs??null,inputCandleCountM15:x.inputCandleCountM15??info.candleCountM15}:null]))}};
}

export async function runAureviaM5Confirmation({scenario, candles, indicators, structure}) {
 const ps=Object.fromEntries(configuredAIProviders().map(p=>[p.id,p]));
 const groq=ps.groq,openrouter=ps.openrouter,cloudflare=ps.cloudflare;
 if(!groq||!openrouter||!cloudflare) return {confirmed:false,score:0,reason:'Analyse M5 suspendue : les trois IA (Groq, OpenRouter et Cloudflare) doivent être disponibles.',providerStatus:{groq:Boolean(groq),openrouter:Boolean(openrouter),cloudflare:Boolean(cloudflare)}};
 if(!Array.isArray(candles)||candles.length<35)return {confirmed:false,score:0,reason:'Historique M5 insuffisant : 35 bougies clôturées sont nécessaires.'};
 const market={scenario,candles:candles.slice(-40),indicators,structure};
 const m5Base='Tu es une IA d’AUREVIA COPILOT. Réponds en français et en JSON valide. Pour cette analyse M5, CONFIRM et WAIT sont les seules décisions autorisées. Les scores sur 100 mesurent la qualité de confluence, jamais une probabilité de gain. N’invente aucun cours, indicateur ni niveau absent.';
 const system=m5Base+' Tu es l’analyste principal M5 d’AUREVIA. Tu analyses uniquement les bougies M5 clôturées fournies et le scénario M15 déjà défini. Ne modifies jamais le sens du scénario. Tu dois déterminer si une entrée raisonnable existe maintenant. Propose un prix d’entrée précis, ou WAIT si aucune entrée raisonnable. Le prix doit être appuyé par la structure, une zone de retest, une liquidité reprise ou une impulsion; ne recopie pas simplement la clôture de la dernière bougie. Ne propose jamais un prix hors de la zone M15 ou au-delà du SL/TP1. JSON: {decision:"CONFIRM|WAIT",entryPrice:null|number,entryZoneLow:null|number,entryZoneHigh:null|number,score:0-100,reasoning,structureEvidence:[],liquidityEvidence:[],riskNotes:[],invalidation}.';
 let lead,review,audit;
 try { lead=await ask(groq,[{role:'system',content:system},{role:'user',content:JSON.stringify(market)}],6500); }
 catch(e){return {confirmed:false,score:0,reason:'Groq indisponible : aucune entrée M5 proposée. '+clean(e.message,160)};}
 const criticSystem=m5Base+' Tu es l’analyste contradicteur M5. Réévalue indépendamment le prix d’entrée proposé par Groq à partir des mêmes bougies et du scénario M15. Ne valide pas par complaisance. Réponds WAIT si le prix est trop tardif, hors zone, non justifié ou incohérent avec SL/TP1. JSON: {decision:"CONFIRM|WAIT",entryPrice:null|number,score:0-100,verdict:"CONFIRME|CONTESTE",reasoning,criticalBlockers:[]}.';
 const controlSystem=m5Base+' Tu es le contrôleur indépendant M5. Vérifie indépendamment la sécurité du même prix proposé par Groq, la cohérence BUY/SELL, la zone M15, le SL, TP1, la fraîcheur des bougies et les risques de poursuite tardive. Tu disposes d’un veto. Ne te fie pas à une autre IA. JSON: {decision:"CONFIRM|WAIT",veto:false,vetoReason,score:0-100,reasoning,criticalBlockers:[]}.';
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
