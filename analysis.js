import {calculateIndicators} from './indicators.js';
import {detectMarketStructure} from './structure.js';
import {detectCandlestickPatterns,detectChartPatterns} from './patterns.js';
import {calculateFixedRangeVolumeProfile} from './volume-profile.js';
import {calculateFibonacciRetracements} from './fibonacci.js';
import {getAnalysisAccessToken} from './auth.js';
import {getMarketStatus} from './market-hours.js';
import {MARKET_INSTRUMENTS} from './market-catalog.js';
import {selectClosedMarketCandles} from './market-candle-validation.js';
import {buildMacroContextForAI} from './macro-context-forwarding.js';
const SYMBOLS=Object.fromEntries(Object.entries(MARKET_INSTRUMENTS).map(([id,item])=>[id,item.provider]));
// M15 est chargé en premier : c'est l'unique unité décisionnelle.
// H4/H1 sont des contextes optionnels ; M30 est requis pour la préparation structurelle. M5 est réservé au surveillant
// de scénario : il valide l'entrée après mitigation, sans être chargé à chaque analyse initiale.
const FRAMES={H4:'4h',H1:'1h',M30:'30min',M15:'15min'};
const FRAME_MINUTES={H4:240,H1:60,M30:30,M15:15,M5:5};
let latest={message:'En attente',tableMessage:'Sélectionnez un instrument pour commencer.',signalReason:'Aucune conclusion avant validation des données.'};
const inFlight=new Map();
const retryAfter=new Map();
const ANALYSIS_COOLDOWN_MS=60000;
export function getAnalysisState(){return latest;}
export function parseProviderTime(value,zone){
 const raw=String(value||'').trim();if(!raw)return NaN;
 // Les horodatages ISO avec Z ou offset sont déjà absolus.
 if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)){const parsed=Date.parse(raw);return Number.isFinite(parsed)?parsed:NaN;}
 const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);if(!match)return NaN;
 const [y,mo,d,h,mi,se]=match.slice(1).map(Number);const utc=Date.UTC(y,mo-1,d,h,mi,se);
 // Sans fuseau explicite, refuser de supposer que l'heure fournisseur est UTC.
 if(!zone)return NaN;
 if(zone==='UTC'||zone==='Etc/UTC'||zone==='GMT')return utc;
 try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));const got=Object.fromEntries(parts.map(p=>[p.type,Number(p.value)]));const represented=Date.UTC(got.year,got.month-1,got.day,got.hour,got.minute,got.second);return utc-(represented-utc);}catch{return NaN;}
}
function isFresh(candles,zone,intervalMinutes){const last=candles.at(-1),stamp=parseProviderTime(last?.time,zone);if(!Number.isFinite(stamp))return false;const age=Date.now()-(stamp+intervalMinutes*60000);return age>=0&&age<=intervalMinutes*1.5*60000;}
async function fetchMacroContext(instrument){try{const token=await getAnalysisAccessToken();if(!token)return {configured:false,notice:'Connexion requise pour les données macro.'};const r=await fetch(`/api/macro-context?instrument=${encodeURIComponent(instrument)}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)return {configured:false,notice:'Flux macro indisponible.'};return await r.json();}catch{return {configured:false,notice:'Flux macro indisponible.'};}}

async function requestAureviaAnalysis(symbol,m15,context){
 const token=await getAnalysisAccessToken();
 if(!token)throw new Error('Connexion requise pour solliciter le moteur IA.');
 const r=await fetch('/api/ai-analysis',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({instrument:symbol,m15:{candles:m15.candles.slice(-120),timezone:m15.timezone||'UTC',indicators:m15.analysis.indicators,structure:m15.analysis.structure,patterns:m15.analysis.patterns,volumeProfile:m15.analysis.volumeProfile,fibonacci:m15.analysis.fibonacci},context}),cache:'no-store',signal:AbortSignal.timeout(40000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){
  const attempts=d.providerDiagnostics?.attempts||[];
  const details=attempts.map(a=>{
   const status=a.status?`HTTP ${a.status}`:'sans réponse HTTP';
   const duration=Number.isFinite(Number(a.elapsedMs))?` · ${Math.round(Number(a.elapsedMs))} ms`:'';
   const issue=a.issue?` · ${String(a.issue).slice(0,180)}`:'';
   return `AUREVIA : ${a.code||'ERREUR'} (${status}${duration})${issue}`;
  });
  const diagnostic=details.length?`\nDiagnostic fournisseurs :\n• ${details.join('\n• ')}`:'';
  const error=new Error(`${d.error||`Moteur IA indisponible (HTTP ${r.status}).`}${diagnostic}`);
  error.code=d.code||'AI_ERROR';
  error.providerDiagnostics=d.providerDiagnostics||null;
  throw error;
 }
 return d;
}
async function fetchFrame(symbol,interval){
 const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion Google requise pour les données de marché.');
 const url=`/api/market-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=250`;
 // Une seule tentative par unité : les retries côté client consomment des crédits
 // supplémentaires et aggravent un quota déjà atteint. Le serveur mutualise les appels.
 const r=await fetch(url,{headers:{authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
 const data=await r.json().catch(()=>({}));
 if(r.status===429){retryAfter.set(symbol,Date.now()+ANALYSIS_COOLDOWN_MS);const limited=new Error(data.error||'Limite de requêtes atteinte. Réessayez dans une minute.');limited.code='MARKET_RATE_LIMIT';limited.retryAfterSeconds=Number(data.retryAfterSeconds)||60;throw limited;}
 if(!r.ok)throw new Error(data.error||`Flux de marché indisponible (HTTP ${r.status}).`);
 if(data.stale===true)throw new Error(`Cache OHLC périmé (${data.staleAgeSeconds??'?'} s) : données conservées pour diagnostic uniquement, interdites pour l’analyse.`);
 const fetchedAt=Date.parse(data.fetchedAt||''),fetchAge=Date.now()-fetchedAt;
 if(!Number.isFinite(fetchedAt)||fetchAge<0||fetchAge>120000)throw new Error('Horodatage de récupération OHLC absent ou trop ancien.');
 if(!Array.isArray(data.candles)||data.candles.length<30)throw new Error('Historique OHLC insuffisant ou invalide.');
 const minutes=({'15min':15,'30min':30,'1h':60,'4h':240})[interval];
 const closed=selectClosedMarketCandles(data.candles,data.timezone||'UTC',minutes,Date.now());
 if(!closed.ok)throw new Error(closed.reason);
 return {...data,candles:closed.candles,excludedUnclosedCandles:closed.excludedUnclosed};
}
export async function loadInstrumentAnalysis(symbol){
 const marketStatus=getMarketStatus(symbol);
 if(!marketStatus.tradable){latest={message:'Marché fermé',tableMessage:'Analyse indisponible pendant la fermeture du marché.',signalReason:`MARCHÉ FERMÉ — ${marketStatus.reason} Réouverture selon l’horaire de référence : ${marketStatus.schedule}.`,decision:'CLOSED',marketStatus,probability:null,score:null,scenarios:{buy:null,sell:null}};return null;}
 const pending=inFlight.get(symbol);if(pending)return pending;
 const retryAt=retryAfter.get(symbol)||0;if(Date.now()<retryAt){latest={...latest,message:'Temporisation du fournisseur',signalReason:`WAIT : trop de requêtes récentes. Nouvelle tentative possible dans ${Math.ceil((retryAt-Date.now())/1000)} s.`};return null;}
 const task=runInstrumentAnalysis(symbol);inFlight.set(symbol,task);try{return await task;}finally{inFlight.delete(symbol);}
}
async function runInstrumentAnalysis(symbol){
 const pair=SYMBOLS[symbol];
 if(!pair){latest={message:'Instrument non pris en charge par le flux OHLC',tableMessage:'Cet instrument ne fait pas partie de la liste autorisée pour les données techniques.',signalReason:'WAIT : historique OHLC validé indisponible pour cet instrument.',decision:'WAIT',probability:null,score:null};return null;}
 try{
  const frames={},unavailable=[];
  // Prioriser l'historique M15 : si le fournisseur est limité, le moteur
  // tente d'abord de récupérer les données réellement nécessaires au moteur IA.
  try{frames.M15=await fetchFrame(pair,FRAMES.M15);}catch(error){unavailable.push({tf:'M15',error:error?.message||'Données indisponibles'});}
  // H4/H1 restent des contextes optionnels ; M30 est requis pour la préparation.
  // Les trois unités sont demandées après le M15 pour maîtriser les appels fournisseur.
  if(frames.M15){
   const optional=Object.entries(FRAMES).filter(([tf])=>tf!=='M15');
   const settled=await Promise.allSettled(optional.map(async([tf,interval])=>[tf,await fetchFrame(pair,interval)]));
   settled.forEach((item,index)=>{const tf=optional[index][0];if(item.status==='fulfilled')frames[item.value[0]]=item.value[1];else unavailable.push({tf,error:item.reason?.message||'Données indisponibles'});});
  }
  const requiredMissing=unavailable.filter(x=>['M15','M30'].includes(x.tf));
  const stale=Object.entries(frames).filter(([tf,d])=>!isFresh(d.candles,d.timezone,FRAME_MINUTES[tf])).map(([tf])=>tf);
  const analyses={};
  for(const [tf,data] of Object.entries(frames)){
   // Une unité optionnelle périmée ne doit jamais influencer le contexte H4/H1/M30. Les bougies restent visibles via le diagnostic.
   if(stale.includes(tf)&&tf!=='M15')continue;
   const candles=data.candles;if(!Array.isArray(candles)||candles.length<30)continue;
   const structure=detectMarketStructure(candles);
   analyses[tf]={indicators:calculateIndicators(candles),structure,patterns:[...detectCandlestickPatterns(candles),...detectChartPatterns(candles)],fibonacci:calculateFibonacciRetracements(structure.swings,structure.bias),volumeProfile:calculateFixedRangeVolumeProfile(candles),last:candles.at(-1)};
  }
  const requiredStale=stale.filter(tf=>['M15','M30'].includes(tf));
  const allRequiredAvailable=!requiredMissing.length&&!requiredStale.length&&analyses.M15?.last&&analyses.M30?.last;
  if(!allRequiredAvailable){
   const details=[...requiredMissing.map(x=>`${x.tf}: ${x.error}`),...requiredStale.map(tf=>`${tf}: données périmées ou horodatage non vérifiable`)];
   const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
   latest={message:'Données opérationnelles incomplètes',tableMessage:'L’analyse directionnelle exige des données M15 et M30 valides.',rows,signalReason:`WAIT — analyse suspendue : ${details.join(' ; ')||'M15 indisponible'}. Réessayez lorsque le flux sera rétabli.`,decision:'WAIT',probability:null,score:null,unavailableFrames:unavailable,staleFrames:stale,frames};
   return null;
  }
  const macroContext=await fetchMacroContext(symbol);
  const m15=analyses.M15;
  const frameBrief=(tf)=>{const a=analyses[tf];if(!a)return {available:false,bias:'indisponible'};const i=a.indicators||{},st=a.structure||{};return {available:true,bias:st.bias||'indéterminé',ema20:i.ema20??null,ema50:i.ema50??null,ema200:i.ema200??null,rsi14:i.rsi14??null,macdHistogram:i.macd?.histogram??null,breaks:(st.breaks||[]).slice(-3).map(x=>({type:x.type,price:x.price??null})),sweeps:(st.sweeps||[]).slice(-2).map(x=>({type:x.type,price:x.price??null})),lastClose:a.last?.close??null,lastCandleTime:(()=>{const stamp=parseProviderTime(a.last?.time,frames[tf]?.timezone||'UTC');return Number.isFinite(stamp)?new Date(stamp).toISOString():null;})()};};
  const higherTimeframes={h4:analyses.H4?.structure?.bias||'indisponible',h1:analyses.H1?.structure?.bias||'indisponible',m30:analyses.M30?.structure?.bias||'indisponible'};
  const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
  let aiResult=null,aiError=null;
  try{aiResult=await requestAureviaAnalysis(symbol,{candles:frames.M15.candles,analysis:m15},{timeframes:{H4:frameBrief('H4'),H1:frameBrief('H1'),M30:frameBrief('M30'),M15:frameBrief('M15')},macro:buildMacroContextForAI(macroContext)});}catch(error){aiError=error.message||'Moteur IA indisponible';}
  const scenarios=aiResult?.scenarios||{buy:null,sell:null};
  const best=aiResult?.decision==='BUY'?scenarios.buy:aiResult?.decision==='SELL'?scenarios.sell:(aiResult?(scenarios.buy||scenarios.sell):null);
  // En cas d'échec IA, ne pas recycler le score technique local dans la jauge
  // réservée au score de confirmation de l'analyse AUREVIA.
  const score=aiResult?(best?.score??best?.scoreComponents?.filter(x=>x.passed).reduce((a,x)=>a+(x.weight||0),0)??null):null;
  const scoreComponents=aiResult?(best?.scoreComponents||[]):[];
  const decision={decision:aiResult?.decision||'WAIT',reason:aiResult?.summary||aiError||'Le moteur IA n’a pas fourni de proposition exploitable.',score,probability:best?.probability??null,collaboration:aiResult?.collaboration||null,scenarios,marketReading:aiResult?.marketReading||'',noScenarioReason:aiResult?.noScenarioReason||'',watchDirectives:aiResult?.watchDirectives||[],risks:aiResult?.risks||[],probabilityDisclaimer:aiResult?.probabilityDisclaimer||'Estimation IA non calibrée.'};
  const optionalMissing=unavailable.filter(x=>x.tf!=='M15');
  const optionalStale=stale.filter(tf=>tf!=='M15');
  const higherConflict=Boolean(best&&[analyses.H4,analyses.H1,analyses.M30].filter(Boolean).some(a=>!['range','indéterminé'].includes(a.structure.bias)&&a.structure.bias!==(best.side==='BUY'?'haussier':'baissier')));
  const patterns=(m15.patterns||[]).map(x=>x.name);
  const warnings=[...optionalMissing.map(x=>`${x.tf} indisponible`),...optionalStale.map(tf=>`${tf} périmé`)];
  latest={collaboration:decision.collaboration||null,message:aiError?'Échec analyse IA · données techniques seules':stale.length||unavailable.length?'Analyse partielle · vérifier les unités de temps':'Analyse AUREVIA · décision et chiffres exclusivement M15',analysisStatus:aiError?'AI_FAILED':'AI_COMPLETED',scoreSource:aiError?'none':'ai',tableMessage:'',rows,score,scoreComponents,analysis:analyses,signalReason:`${decision.decision||'WAIT'} : ${decision.reason||'Aucune justification fournie.'}${decision.decision==='WAIT'&&!scenarios.buy&&!scenarios.sell?(decision.noScenarioReason?`\n\nAucun scénario exploitable : ${decision.noScenarioReason}`:'\n\nAucun scénario BUY/SELL suffisamment défendable pour le moment.') : ''}${aiError?' Moteur IA indisponible : '+aiError:''}${warnings.length?' Unités manquantes/périmées : '+warnings.join(', ')+'.':''}${patterns.length?' Figures détectées : '+[...new Set(patterns)].join(', ')+'.':''}`,decision:decision.decision||'WAIT',decisionDetails:decision,scenarios:decision.scenarios,probability:best?.probability??null,probabilityDisclaimer:decision.probabilityDisclaimer,marketReading:decision.marketReading,noScenarioReason:decision.noScenarioReason,watchDirectives:decision.watchDirectives,risks:decision.risks,higherTimeframes,higherConflict,frames,macroContext,unavailableFrames:unavailable,staleFrames:stale};
  return {price:m15.last.close,status:unavailable.length||stale.length?'partiel':'reçu'};
 }catch(error){latest={message:'Erreur technique pendant l’analyse',tableMessage:'Les données n’ont pas pu être traitées.',signalReason:`WAIT — erreur technique : ${error.message||'erreur inconnue'}. Aucune entrée ne sera proposée sans données valides.`,decision:'WAIT',probability:null,score:null};return null;}
}
