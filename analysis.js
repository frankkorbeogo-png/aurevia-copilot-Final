import {calculateIndicators} from './indicators.js';
import {detectMarketStructure} from './structure.js';
import {detectCandlestickPatterns,detectChartPatterns} from './patterns.js';
import {evaluateConfluence} from './confluence.js';
import {calculateFixedRangeVolumeProfile} from './volume-profile.js';
import {calculateFibonacciRetracements} from './fibonacci.js';
import {getAnalysisAccessToken} from './auth.js';
import {generateOpportunityScenarios} from './opportunity-engine.js';
const SYMBOLS={XAUUSD:'XAU/USD',XAGUSD:'XAG/USD',EURUSD:'EUR/USD',GBPUSD:'GBP/USD',USDJPY:'USD/JPY',AUDUSD:'AUD/USD',USDCAD:'USD/CAD',USDCHF:'USD/CHF',NZDUSD:'NZD/USD',EURGBP:'EUR/GBP',EURJPY:'EUR/JPY',GBPJPY:'GBP/JPY',BTCUSD:'BTC/USD',ETHUSD:'ETH/USD'};
const FRAMES={H4:'4h',H1:'1h',M30:'30min',M15:'15min',M5:'5min'};
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
async function fetchMacroContext(){try{const token=await getAnalysisAccessToken();if(!token)return {configured:false,notice:'Connexion requise pour les données macro.'};const r=await fetch('/api/macro-context',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)return {configured:false,notice:'Flux macro indisponible.'};return await r.json();}catch{return {configured:false,notice:'Flux macro indisponible.'};}}
async function fetchFrame(symbol,interval){const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion Google requise pour les données de marché.');const url=`/api/market-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=250`;const r=await fetch(url,{headers:{authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(14000)});const data=await r.json().catch(()=>({}));if(r.status===429){retryAfter.set(symbol,Date.now()+ANALYSIS_COOLDOWN_MS);throw new Error(data.error||'Quota de requêtes atteint. Réessayez dans 15 secondes.');}if(!r.ok)throw new Error(data.error||`Flux de marché indisponible (HTTP ${r.status}).`);if(!Array.isArray(data.candles)||data.candles.length<30)throw new Error('Historique OHLC insuffisant ou invalide.');return data;}
export async function loadInstrumentAnalysis(symbol){
 const pending=inFlight.get(symbol);if(pending)return pending;
 const retryAt=retryAfter.get(symbol)||0;if(Date.now()<retryAt){latest={...latest,message:'Temporisation du fournisseur',signalReason:`WAIT : trop de requêtes récentes. Nouvelle tentative possible dans ${Math.ceil((retryAt-Date.now())/1000)} s.`};return null;}
 const task=runInstrumentAnalysis(symbol);inFlight.set(symbol,task);try{return await task;}finally{inFlight.delete(symbol);}
}
async function runInstrumentAnalysis(symbol){
 const pair=SYMBOLS[symbol];
 if(!pair){latest={message:'Instrument non pris en charge par le flux OHLC',tableMessage:'Cet instrument ne fait pas partie de la liste autorisée pour les données techniques.',signalReason:'WAIT : historique OHLC validé indisponible pour cet instrument.',decision:'WAIT',probability:null,score:null};return null;}
 try{
  const settled=await Promise.allSettled(Object.entries(FRAMES).map(async([tf,interval])=>[tf,await fetchFrame(pair,interval)]));
  const frames={},unavailable=[];
  settled.forEach((item,index)=>{const tf=Object.keys(FRAMES)[index];if(item.status==='fulfilled')frames[item.value[0]]=item.value[1];else unavailable.push({tf,error:item.reason?.message||'Données indisponibles'});});
  const requiredMissing=unavailable.filter(x=>['M30','M15'].includes(x.tf));
  const stale=Object.entries(frames).filter(([tf,d])=>!isFresh(d.candles,d.timezone,FRAME_MINUTES[tf])).map(([tf])=>tf);
  const analyses={};
  for(const [tf,data] of Object.entries(frames)){
   // Une unité optionnelle périmée ne doit jamais influencer le score, le sweep
   // M5 ou le contexte H4/H1. Les bougies restent visibles via le diagnostic.
   if(stale.includes(tf)&&!['M30','M15'].includes(tf))continue;
   const candles=data.candles;if(!Array.isArray(candles)||candles.length<30)continue;
   const structure=detectMarketStructure(candles);
   analyses[tf]={indicators:calculateIndicators(candles),structure,patterns:[...detectCandlestickPatterns(candles),...detectChartPatterns(candles)],fibonacci:calculateFibonacciRetracements(structure.swings,structure.bias),volumeProfile:calculateFixedRangeVolumeProfile(candles),last:candles.at(-1)};
  }
  const requiredStale=stale.filter(tf=>['M30','M15'].includes(tf));
  const missingNames=unavailable.map(x=>x.tf),allRequiredAvailable=!requiredMissing.length&&!requiredStale.length&&analyses.M30?.last&&analyses.M15?.last;
  if(!allRequiredAvailable){
   const details=[...requiredMissing.map(x=>`${x.tf}: ${x.error}`),...requiredStale.map(tf=>`${tf}: données périmées ou horodatage non vérifiable`)];
   const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
   latest={message:'Données opérationnelles incomplètes',tableMessage:'L’analyse directionnelle exige des données M30 et M15 valides.',rows,signalReason:`WAIT — analyse suspendue : ${details.join(' ; ')||'M30/M15 indisponibles'}. Réessayez lorsque le flux sera rétabli.`,decision:'WAIT',probability:null,score:null,unavailableFrames:unavailable,staleFrames:stale,frames};
   return null;
  }
  const macroContext=symbol==='XAUUSD'?await fetchMacroContext():{configured:false,notice:'Analyse macro désactivée pour cet instrument.'};
  const h4=analyses.H4,h1=analyses.H1,m30=analyses.M30,m15=analyses.M15,m5=analyses.M5;
  const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
  const baseConfluence=evaluateConfluence({m30,m15,m5});
  const {direction,scoreComponents}=baseConfluence;
  const higherTimeframes={h4:h4?.structure?.bias||'indisponible',h1:h1?.structure?.bias||'indisponible'};
  const matches=bias=>direction==='BUY'?bias==='haussier':direction==='SELL'?bias==='baissier':false;
  const h4Match=Boolean(h4&&matches(h4.structure.bias)),h1Match=Boolean(h1&&matches(h1.structure.bias));
  const higherConflict=Boolean(direction&&[h4,h1].filter(Boolean).some(x=>!['range','indéterminé'].includes(x.structure.bias)&&!matches(x.structure.bias)));
  const score=Math.max(0,Math.min(100,Math.round(baseConfluence.score*.8+(h4Match?10:0)+(h1Match?10:0))));
  scoreComponents.push({label:`Contexte H4 (${higherTimeframes.h4})`,passed:h4Match,weight:10,available:Boolean(h4)});
  scoreComponents.push({label:`Contexte H1 (${higherTimeframes.h1})`,passed:h1Match,weight:10,available:Boolean(h1)});
  const technicalScenarios=generateOpportunityScenarios({analyses,frames,staleFrames:[]});
  const optionalMissing=unavailable.filter(x=>!['M30','M15'].includes(x.tf));
  const optionalStale=stale.filter(tf=>!['M30','M15'].includes(tf));
  const allFramesFresh=Object.keys(FRAMES).every(tf=>analyses[tf]&& !stale.includes(tf));
  let decision={decision:'WAIT',reason:'Confluence multi-timeframe incomplète. Les critères pondérés doivent être confirmés.',score,probability:null,scenarios:technicalScenarios};
  if(allFramesFresh){
   let accessToken=null;try{accessToken=await getAnalysisAccessToken();}catch{}
   if(!accessToken)decision.reason='Analyse IA réservée aux comptes connectés. Les scénarios techniques restent consultables.';
   else {
    try{
     const response=await fetch('/api/ai-analysis',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${accessToken}`},body:JSON.stringify({symbol:pair,timeframes:Object.fromEntries(Object.entries(frames).map(([tf,d])=>[tf,d.candles])),macroContext}),signal:AbortSignal.timeout(25000)});
     const result=await response.json().catch(()=>({}));
     if(response.ok)decision={...result,score,probability:null,scenarios:{buy:result.scenarios?.buy?.status==='IDENTIFIED'?result.scenarios.buy:technicalScenarios.buy,sell:result.scenarios?.sell?.status==='IDENTIFIED'?result.scenarios.sell:technicalScenarios.sell,engine:technicalScenarios.engine}};
     else decision={decision:'WAIT',reason:result.error||`Moteur IA indisponible (HTTP ${response.status}).`,score,probability:null,scenarios:technicalScenarios};
    }catch(error){decision={decision:'WAIT',reason:`Moteur IA temporairement inaccessible : ${error.message||'erreur réseau'}. Les scénarios techniques restent disponibles.`,score,probability:null,scenarios:technicalScenarios};}
   }
  }else{
   const issues=[...optionalMissing.map(x=>`${x.tf} indisponible`),...optionalStale.map(tf=>`${tf} périmé`)];
   decision.reason=`WAIT : contexte incomplet (${issues.join(', ')}). Le scénario technique reste indicatif ; l’IA ne confirme aucune entrée sans les cinq unités de temps valides.`;
  }
  if(!m5)decision.reason=`WAIT : M5 indisponible, aucun déclencheur d’entrée ne peut être confirmé. ${decision.reason||''}`.trim();
  if((decision.decision==='BUY'&&direction!=='BUY')||(decision.decision==='SELL'&&direction!=='SELL'))decision={...decision,decision:'WAIT',reason:'Entrée non confirmée ou décision incompatible avec la structure M30/M15. Les scénarios potentiels restent consultables.',score,probability:null};
  const candidates=['BUY','SELL'].filter(side=>['IDENTIFIED','WATCH'].includes(technicalScenarios[side.toLowerCase()]?.status));
  if(decision.decision==='WAIT'&&candidates.length)decision.reason=`Entrée non confirmée : plans chiffrés ${candidates.join(' et ')} disponibles. WAIT signifie que le déclencheur M5 n'est pas confirmé ; les plans conditionnels et leurs niveaux sont affichés séparément. ${decision.reason||''}`.trim();
  if(decision.decision==='WAIT'&&!candidates.length)decision.reason=`Aucun scénario défendable pour le moment : confluences M30/M15 insuffisantes. ${decision.reason||''}`.trim();
  if(higherConflict)decision.reason=`${decision.reason||''} Conflit de contexte : H4/H1 ne sont pas entièrement alignés avec M30/M15 ; prudence renforcée.`.trim();
  const patterns=['M30','M15','M5'].flatMap(tf=>analyses[tf]?.patterns||[]).map(x=>x.name);
  const warnings=[...optionalMissing.map(x=>`${x.tf} indisponible`),...optionalStale.map(tf=>`${tf} périmé`)];
  latest={message:stale.length||unavailable.length?'Analyse partielle · vérifier les unités de temps':'Données OHLC reçues · H4 / H1 / M30 / M15 / M5',tableMessage:'',rows,score,scoreComponents,analysis:analyses,signalReason:`${decision.decision||'WAIT'} : ${decision.reason||'Aucune justification fournie.'}${warnings.length?' Unités manquantes/périmées : '+warnings.join(', ')+'.':''}${patterns.length?' Figures détectées : '+[...new Set(patterns)].join(', ')+'.':''}`,decision:decision.decision||'WAIT',decisionDetails:decision,scenarios:decision.scenarios||technicalScenarios,probability:null,higherTimeframes,higherConflict,frames,macroContext,unavailableFrames:unavailable,staleFrames:stale};
  return {price:(m5||m15).last.close,status:unavailable.length||stale.length?'partiel':'reçu'};
 }catch(error){latest={message:'Erreur technique pendant l’analyse',tableMessage:'Les données n’ont pas pu être traitées.',signalReason:`WAIT — erreur technique : ${error.message||'erreur inconnue'}. Aucune entrée ne sera proposée sans données valides.`,decision:'WAIT',probability:null,score:null};return null;}
}
