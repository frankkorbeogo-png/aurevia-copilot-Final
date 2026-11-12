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
async function fetchFrame(symbol,interval){const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion Google requise pour les données de marché.');const url=`/api/market-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=250`;const r=await fetch(url,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const data=await r.json();if(r.status===429){retryAfter.set(symbol,Date.now()+ANALYSIS_COOLDOWN_MS);throw new Error(data.error||'Quota de requêtes atteint. Réessayez dans 15 secondes.');}if(!r.ok)throw new Error(data.error||'Flux de marché indisponible.');return data;}
export async function loadInstrumentAnalysis(symbol){
 const pending=inFlight.get(symbol);if(pending)return pending;
 const retryAt=retryAfter.get(symbol)||0;if(Date.now()<retryAt){latest={...latest,message:'Temporisation du fournisseur',signalReason:`WAIT : trop de requêtes récentes. Nouvelle tentative possible dans ${Math.ceil((retryAt-Date.now())/1000)} s.`};return null;}
 const task=runInstrumentAnalysis(symbol);inFlight.set(symbol,task);try{return await task;}finally{inFlight.delete(symbol);}
}
async function runInstrumentAnalysis(symbol){
 const pair=SYMBOLS[symbol];if(!pair){latest={message:'Instrument non pris en charge par le flux OHLC',tableMessage:'Cet instrument ne fait pas partie de la liste autorisée pour les données techniques.',signalReason:'WAIT : historique OHLC validé indisponible pour cet instrument.'};return null;}
 try{
  const frameEntries=await Promise.all(Object.entries(FRAMES).map(async([tf,interval])=>[tf,await fetchFrame(pair,interval)]));const frames=Object.fromEntries(frameEntries);const macroContext=symbol==='XAUUSD'?await fetchMacroContext():{configured:false,notice:'Analyse macro désactivée pour cet instrument.'};
  const stale=Object.entries(frames).filter(([tf,d])=>!isFresh(d.candles,d.timezone,FRAME_MINUTES[tf]));
  const analyses={};for(const [tf,data] of Object.entries(frames)){const candles=data.candles;const structure=detectMarketStructure(candles);analyses[tf]={indicators:calculateIndicators(candles),structure,patterns:[...detectCandlestickPatterns(candles),...detectChartPatterns(candles)],fibonacci:calculateFibonacciRetracements(structure.swings,structure.bias),volumeProfile:calculateFixedRangeVolumeProfile(candles),last:candles.at(-1)};}
  const h4=analyses.H4,h1=analyses.H1,m30=analyses.M30,m15=analyses.M15,m5=analyses.M5;
  const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
  const baseConfluence=evaluateConfluence({m30,m15,m5});
  const {direction,scoreComponents,aligned}=baseConfluence;
  const higherTimeframes={h4:h4.structure.bias,h1:h1.structure.bias};
  const matches=(bias)=>direction==='BUY'?bias==='haussier':direction==='SELL'?bias==='baissier':false;
  const h4Match=matches(h4.structure.bias),h1Match=matches(h1.structure.bias);
  const higherConflict=Boolean(direction&&((h4.structure.bias!=='range'&&h4.structure.bias!=='indéterminé'&&!h4Match)||(h1.structure.bias!=='range'&&h1.structure.bias!=='indéterminé'&&!h1Match)));
  const score=Math.max(0,Math.min(100,Math.round(baseConfluence.score*0.8+(h4Match?10:0)+(h1Match?10:0))));
  scoreComponents.push({label:`Contexte H4 (${h4.structure.bias})`,passed:h4Match,weight:10});
  scoreComponents.push({label:`Contexte H1 (${h1.structure.bias})`,passed:h1Match,weight:10});
  const operationalStale=stale.filter(([tf])=>['M30','M15'].includes(tf));
  const technicalScenarios=generateOpportunityScenarios({analyses,frames,staleFrames:operationalStale.map(x=>x[0])});
  let decision={decision:'WAIT',reason:'Confluence multi-timeframe incomplète. Les critères pondérés doivent être confirmés.',score,probability:null,scenarios:technicalScenarios};
  if(!operationalStale.length&&m30?.last&&m15?.last){
    let accessToken=null;try{accessToken=await getAnalysisAccessToken();}catch{}
    if(!accessToken)decision.reason='Analyse IA réservée aux comptes connectés. Connectez-vous dans Paramètres & profil ; les indicateurs techniques restent consultables.';
    else {
    const response=await fetch('/api/ai-analysis',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${accessToken}`},body:JSON.stringify({symbol:pair,timeframes:Object.fromEntries(Object.entries(frames).map(([tf,d])=>[tf,d.candles])),macroContext})});
    const result=await response.json();
    if(response.ok)decision={...result,score,probability:null,scenarios:{buy:result.scenarios?.buy?.status==='IDENTIFIED'?result.scenarios.buy:technicalScenarios.buy,sell:result.scenarios?.sell?.status==='IDENTIFIED'?result.scenarios.sell:technicalScenarios.sell,engine:technicalScenarios.engine}};else decision={decision:'WAIT',reason:result.error||'Moteur IA indisponible.',score,probability:null,scenarios:technicalScenarios};
    }
  }else if(operationalStale.length)decision.reason='WAIT : données opérationnelles M30/M15 périmées ou horodatage non vérifiable sur '+operationalStale.map(x=>x[0]).join(', ')+'. Les contextes H4/H1 ne bloquent plus à eux seuls la recherche de scénarios.';
  else decision.reason='WAIT : structure M30/M15 insuffisante ou données non alignées. M5 ne déterminent pas la direction ; ils servent uniquement à confirmer le point d’entrée.';
  if((decision.decision==='BUY'&&direction!=='BUY')||(decision.decision==='SELL'&&direction!=='SELL'))decision={...decision,decision:'WAIT',reason:'Entrée non confirmée ou décision incompatible avec la structure M30/M15. Les scénarios potentiels restent consultables.',score,probability:null};
  if(higherConflict)decision.reason=`${decision.reason||''} Conflit de contexte : H4/H1 ne sont pas entièrement alignés avec la direction opérationnelle M30/M15 ; prudence renforcée.`.trim();
  const patterns=[...m30.patterns,...m15.patterns,...m5.patterns].map(x=>x.name);
  latest={message:operationalStale.length?'Données M30/M15 à actualiser':stale.length?'Données reçues · fraîcheur H4/H1 à considérer':'Données OHLC reçues · H4 / H1 / M30 / M15 / M5',tableMessage:'',rows,score,scoreComponents,analysis:analyses,signalReason:`${decision.decision||'WAIT'} : ${decision.reason||'Aucune justification fournie.'}${patterns.length?' Figures détectées : '+[...new Set(patterns)].join(', ')+'.':''}`,decision:decision.decision||'WAIT',decisionDetails:decision,scenarios:decision.scenarios||technicalScenarios,probability:null,higherTimeframes,higherConflict,frames,macroContext};
  return {price:m5.last.close,status:'reçu'};
 }catch(error){latest={message:'Analyse indisponible',tableMessage:'Impossible de charger les unités H4/H1/M30/M15/M5.',signalReason:'WAIT : '+error.message,decision:'WAIT',probability:null,score:null};return null;}
}
