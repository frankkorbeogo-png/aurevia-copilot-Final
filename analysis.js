import {calculateIndicators} from './indicators.js';
import {detectMarketStructure} from './structure.js';
import {detectCandlestickPatterns,detectChartPatterns} from './patterns.js';
import {calculateFixedRangeVolumeProfile} from './volume-profile.js';
import {calculateFibonacciRetracements} from './fibonacci.js';
import {getAnalysisAccessToken} from './auth.js';
import {generateOpportunityScenarios} from './opportunity-engine.js';
import {getMarketStatus} from './market-hours.js';
const SYMBOLS={XAUUSD:'XAU/USD',XAGUSD:'XAG/USD',EURUSD:'EUR/USD',GBPUSD:'GBP/USD',USDJPY:'USD/JPY',AUDUSD:'AUD/USD',USDCAD:'USD/CAD',USDCHF:'USD/CHF',NZDUSD:'NZD/USD',EURGBP:'EUR/GBP',EURJPY:'EUR/JPY',GBPJPY:'GBP/JPY',BTCUSD:'BTC/USD',ETHUSD:'ETH/USD'};
// M15 est chargé en premier : c'est l'unique unité décisionnelle.
// H4/H1/M30 restent des contextes optionnels ; M5/M1 sont consultés sur TradingView
// pour affiner l'entrée, sans ajouter quatre appels OHLC à chaque analyse.
const FRAMES={H4:'4h',H1:'1h',M30:'30min',M15:'15min'};
const FRAME_MINUTES={H4:240,H1:60,M30:30,M15:15,M5:5};
let latest={message:'En attente',tableMessage:'Sélectionnez un instrument pour commencer.',signalReason:'Aucune conclusion avant validation des données.'};
const inFlight=new Map();
const retryAfter=new Map();
const ANALYSIS_COOLDOWN_MS=15000;
export function getAnalysisState(){return latest;}
function parseProviderTime(value,zone){
 const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);if(!match)return NaN;
 const [y,mo,d,h,mi,se]=match.slice(1).map(Number);const utc=Date.UTC(y,mo-1,d,h,mi,se);if(!zone)return utc;
 try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));const got=Object.fromEntries(parts.map(p=>[p.type,Number(p.value)]));const represented=Date.UTC(got.year,got.month-1,got.day,got.hour,got.minute,got.second);return utc-(represented-utc);}catch{return NaN;}
}
function isFresh(candles,zone,intervalMinutes){const last=candles.at(-1),stamp=parseProviderTime(last?.time,zone);if(!Number.isFinite(stamp))return false;const age=(Date.now()-stamp)/60000;return age>=-intervalMinutes*1.5&&age<=intervalMinutes*2.5;}
async function fetchMacroContext(instrument){try{const token=await getAnalysisAccessToken();if(!token)return {configured:false,notice:'Connexion requise pour les données macro.'};const r=await fetch(`/api/macro-context?instrument=${encodeURIComponent(instrument)}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)return {configured:false,notice:'Flux macro indisponible.'};return await r.json();}catch{return {configured:false,notice:'Flux macro indisponible.'};}}
async function requestGroqAnalysis(symbol,m15,context){const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion requise pour solliciter Groq.');const r=await fetch('/api/ai-analysis',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({instrument:symbol,m15:{candles:m15.candles.slice(-120),indicators:m15.analysis.indicators,structure:m15.analysis.structure,patterns:m15.analysis.patterns,volumeProfile:m15.analysis.volumeProfile,fibonacci:m15.analysis.fibonacci},context}),cache:'no-store',signal:AbortSignal.timeout(30000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Groq indisponible (HTTP ${r.status}).`);return d;}
async function fetchFrame(symbol,interval){
 const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion Google requise pour les données de marché.');
 const url=`/api/market-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=250`;
 // Le M15 est indispensable à la décision : on le retente séparément sur les erreurs transitoires,
 // sans transformer une panne en signal ni réutiliser des bougies périmées.
 const attempts=interval==='15min'?3:2;let lastError=null;
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const r=await fetch(url,{headers:{authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(16000)});
   const data=await r.json().catch(()=>({}));
   if(r.status===429){retryAfter.set(symbol,Date.now()+ANALYSIS_COOLDOWN_MS);throw new Error(data.error||'Quota de requêtes atteint. Réessayez dans 15 secondes.');}
   if(r.ok){if(!Array.isArray(data.candles)||data.candles.length<30)throw new Error('Historique OHLC insuffisant ou invalide.');return data;}
   lastError=new Error(data.error||`Flux de marché indisponible (HTTP ${r.status}).`);
   if(![408,425,500,502,503,504].includes(r.status))throw lastError;
  }catch(error){lastError=error;if(error.message?.includes('Quota de requêtes'))throw error;}
  if(attempt<attempts-1)await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
 }
 throw lastError||new Error('Flux de marché indisponible après plusieurs tentatives.');
}
export async function loadInstrumentAnalysis(symbol){
 const marketStatus=getMarketStatus(symbol);
 if(!marketStatus.tradable){latest={message:'Marché fermé',tableMessage:'Analyse indisponible pendant la fermeture hebdomadaire.',signalReason:`MARCHÉ FERMÉ — ${marketStatus.reason} Réouverture selon l’horaire standard : ${marketStatus.schedule}.`,decision:'CLOSED',marketStatus,probability:null,score:null,scenarios:{buy:null,sell:null}};return null;}
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
  // tente d'abord de récupérer les données réellement nécessaires à Groq.
  try{frames.M15=await fetchFrame(pair,FRAMES.M15);}catch(error){unavailable.push({tf:'M15',error:error?.message||'Données indisponibles'});}
  // Les unités supérieures ne sont que du contexte. Leur panne ne bloque
  // jamais l'analyse M15 et elles sont demandées seulement après le M15.
  if(frames.M15){
   const optional=Object.entries(FRAMES).filter(([tf])=>tf!=='M15');
   const settled=await Promise.allSettled(optional.map(async([tf,interval])=>[tf,await fetchFrame(pair,interval)]));
   settled.forEach((item,index)=>{const tf=optional[index][0];if(item.status==='fulfilled')frames[item.value[0]]=item.value[1];else unavailable.push({tf,error:item.reason?.message||'Données indisponibles'});});
  }
  const requiredMissing=unavailable.filter(x=>x.tf==='M15');
  const stale=Object.entries(frames).filter(([tf,d])=>!isFresh(d.candles,d.timezone,FRAME_MINUTES[tf])).map(([tf])=>tf);
  const analyses={};
  for(const [tf,data] of Object.entries(frames)){
   // Une unité optionnelle périmée ne doit jamais influencer le contexte H4/H1/M30. Les bougies restent visibles via le diagnostic.
   if(stale.includes(tf)&&tf!=='M15')continue;
   const candles=data.candles;if(!Array.isArray(candles)||candles.length<30)continue;
   const structure=detectMarketStructure(candles);
   analyses[tf]={indicators:calculateIndicators(candles),structure,patterns:[...detectCandlestickPatterns(candles),...detectChartPatterns(candles)],fibonacci:calculateFibonacciRetracements(structure.swings,structure.bias),volumeProfile:calculateFixedRangeVolumeProfile(candles),last:candles.at(-1)};
  }
  const requiredStale=stale.filter(tf=>tf==='M15');
  const allRequiredAvailable=!requiredMissing.length&&!requiredStale.length&&analyses.M15?.last;
  if(!allRequiredAvailable){
   const details=[...requiredMissing.map(x=>`${x.tf}: ${x.error}`),...requiredStale.map(tf=>`${tf}: données périmées ou horodatage non vérifiable`)];
   const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
   latest={message:'Données opérationnelles incomplètes',tableMessage:'L’analyse directionnelle exige uniquement des données M15 valides.',rows,signalReason:`WAIT — analyse suspendue : ${details.join(' ; ')||'M15 indisponible'}. Réessayez lorsque le flux sera rétabli.`,decision:'WAIT',probability:null,score:null,unavailableFrames:unavailable,staleFrames:stale,frames};
   return null;
  }
  const macroContext=await fetchMacroContext(symbol);
  const m15=analyses.M15;
  const higherTimeframes={h4:analyses.H4?.structure?.bias||'indisponible',m30:analyses.M30?.structure?.bias||'indisponible'};
  const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
  const technicalScenarios=generateOpportunityScenarios({analyses,frames,staleFrames:stale});
  let groqResult=null,groqError=null;
  try{groqResult=await requestGroqAnalysis(symbol,{candles:frames.M15.candles,analysis:m15},{h4:higherTimeframes.h4,m30:higherTimeframes.m30,macro:macroContext?.configured?macroContext:'indisponible'});}catch(error){groqError=error.message||'Groq indisponible';}
  const scenarios=groqResult?.scenarios||{buy:null,sell:null};
  const technicalBest=(!technicalScenarios.sell||technicalScenarios.buy?.score>=technicalScenarios.sell?.score)?technicalScenarios.buy:technicalScenarios.sell;
  const best=groqResult?.decision==='BUY'?scenarios.buy:groqResult?.decision==='SELL'?scenarios.sell:(scenarios.buy||scenarios.sell);
  const score=best?.score??best?.scoreComponents?.filter(x=>x.passed).reduce((a,x)=>a+(x.weight||0),0)??technicalBest?.score??null;
  const scoreComponents=best?.scoreComponents||technicalBest?.scoreComponents||[];
  const decision={decision:groqResult?.decision||'WAIT',reason:groqResult?.summary||groqError||'Groq n’a pas fourni de proposition exploitable.',score,probability:best?.probability??null,scenarios,marketReading:groqResult?.marketReading||'',risks:groqResult?.risks||[],probabilityDisclaimer:groqResult?.probabilityDisclaimer||'Estimation IA non calibrée.'};
  const optionalMissing=unavailable.filter(x=>x.tf!=='M15');
  const optionalStale=stale.filter(tf=>tf!=='M15');
  const higherConflict=Boolean(best&&[analyses.H4,analyses.H1,analyses.M30].filter(Boolean).some(a=>!['range','indéterminé'].includes(a.structure.bias)&&a.structure.bias!==(best.side==='BUY'?'haussier':'baissier')));
  const patterns=(m15.patterns||[]).map(x=>x.name);
  const warnings=[...optionalMissing.map(x=>`${x.tf} indisponible`),...optionalStale.map(tf=>`${tf} périmé`)];
  latest={message:stale.length||unavailable.length?'Analyse partielle · vérifier les unités de temps':groqError?'Données M15 reçues · Groq indisponible':'Analyse Groq · décision et chiffres exclusivement M15',tableMessage:'',rows,score,scoreComponents,analysis:analyses,signalReason:`${decision.decision||'WAIT'} : ${decision.reason||'Aucune justification fournie.'}${groqError?' Groq indisponible : '+groqError:''}${warnings.length?' Unités manquantes/périmées : '+warnings.join(', ')+'.':''}${patterns.length?' Figures détectées : '+[...new Set(patterns)].join(', ')+'.':''}`,decision:decision.decision||'WAIT',decisionDetails:decision,scenarios:decision.scenarios,probability:best?.probability??null,probabilityDisclaimer:decision.probabilityDisclaimer,marketReading:decision.marketReading,risks:decision.risks,higherTimeframes,higherConflict,frames,macroContext,unavailableFrames:unavailable,staleFrames:stale};
  return {price:m15.last.close,status:unavailable.length||stale.length?'partiel':'reçu'};
 }catch(error){latest={message:'Erreur technique pendant l’analyse',tableMessage:'Les données n’ont pas pu être traitées.',signalReason:`WAIT — erreur technique : ${error.message||'erreur inconnue'}. Aucune entrée ne sera proposée sans données valides.`,decision:'WAIT',probability:null,score:null};return null;}
}
