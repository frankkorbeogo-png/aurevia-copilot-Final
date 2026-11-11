import {calculateIndicators} from './indicators.js';
import {detectMarketStructure} from './structure.js';
import {detectCandlestickPatterns,detectChartPatterns} from './patterns.js';
import {evaluateConfluence} from './confluence.js';
import {calculateFixedRangeVolumeProfile} from './volume-profile.js';
import {calculateFibonacciRetracements} from './fibonacci.js';
import {getAnalysisAccessToken} from './auth.js';
const SYMBOLS={XAUUSD:'XAU/USD',XAGUSD:'XAG/USD',EURUSD:'EUR/USD',GBPUSD:'GBP/USD',USDJPY:'USD/JPY',AUDUSD:'AUD/USD',USDCAD:'USD/CAD',USDCHF:'USD/CHF',NZDUSD:'NZD/USD',EURGBP:'EUR/GBP',EURJPY:'EUR/JPY',GBPJPY:'GBP/JPY',BTCUSD:'BTC/USD',ETHUSD:'ETH/USD'};
const FRAMES={H4:'4h',M30:'30min',M15:'15min',M5:'5min',M1:'1min'};
let latest={message:'En attente',tableMessage:'Sélectionnez un instrument pour commencer.',signalReason:'Aucune conclusion avant validation des données.'};
export function getAnalysisState(){return latest;}
function parseProviderTime(value,zone){
 const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);if(!match)return NaN;
 const [y,mo,d,h,mi,se]=match.slice(1).map(Number);const utc=Date.UTC(y,mo-1,d,h,mi,se);if(!zone)return utc;
 try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));const got=Object.fromEntries(parts.map(p=>[p.type,Number(p.value)]));const represented=Date.UTC(got.year,got.month-1,got.day,got.hour,got.minute,got.second);return utc-(represented-utc);}catch{return NaN;}
}
function isFresh(candles,zone,intervalMinutes){const last=candles.at(-1),stamp=parseProviderTime(last?.time,zone);if(!Number.isFinite(stamp))return false;const age=(Date.now()-stamp)/60000;return age>=-intervalMinutes*1.5&&age<=intervalMinutes*2.5;}
async function fetchFrame(symbol,interval){const url=`/api/market-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=250`;const r=await fetch(url,{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error||'Flux de marché indisponible.');return data;}
export async function loadInstrumentAnalysis(symbol){
 const pair=SYMBOLS[symbol];if(!pair){latest={message:'Instrument non pris en charge par le flux OHLC',tableMessage:'Cet instrument ne fait pas partie de la liste autorisée pour les données techniques.',signalReason:'WAIT : historique OHLC validé indisponible pour cet instrument.'};return null;}
 try{
  const frames={};for(const [tf,interval] of Object.entries(FRAMES))frames[tf]=await fetchFrame(pair,interval);
  const stale=Object.entries(frames).filter(([tf,d])=>!isFresh(d.candles,d.timezone,{H4:240,M30:30,M15:15,M5:5,M1:1}[tf]));
  const analyses={};for(const [tf,data] of Object.entries(frames)){const candles=data.candles;const structure=detectMarketStructure(candles);analyses[tf]={indicators:calculateIndicators(candles),structure,patterns:[...detectCandlestickPatterns(candles),...detectChartPatterns(candles)],fibonacci:calculateFibonacciRetracements(structure.swings,structure.bias),volumeProfile:calculateFixedRangeVolumeProfile(candles),last:candles.at(-1)};}
  const h4=analyses.H4,m30=analyses.M30,m15=analyses.M15,m5=analyses.M5,m1=analyses.M1;
  const rows=Object.entries(analyses).map(([tf,a])=>({tf,ema200:a.indicators.ema200,rsi14:a.indicators.rsi14,bias:a.structure.bias,breaks:a.structure.breaks.map(x=>x.type).join(', ')||'—'}));
  const {direction,score,scoreComponents,aligned}=evaluateConfluence({h4,m30,m15,m5,m1});
  let decision={decision:'WAIT',reason:'Confluence multi-timeframe incomplète. Les critères pondérés doivent être confirmés.',score,probability:null};
  if(!stale.length&&aligned){
    let accessToken=null;try{accessToken=await getAnalysisAccessToken();}catch{}
    if(!accessToken)decision.reason='Analyse IA réservée aux comptes connectés. Connectez-vous dans Paramètres & profil ; les indicateurs techniques restent consultables.';
    else {
    const response=await fetch('/api/ai-analysis',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${accessToken}`},body:JSON.stringify({symbol:pair,timeframes:Object.fromEntries(Object.entries(frames).map(([tf,d])=>[tf,d.candles]))})});
    const result=await response.json();
    if(response.ok)decision={...result,score,probability:null};else decision={decision:'WAIT',reason:result.error||'Moteur IA indisponible.',score,probability:null};
    }
  }else if(stale.length)decision.reason='WAIT : données périmées ou horodatage non vérifiable sur '+stale.map(x=>x[0]).join(', ')+'.';
  else decision.reason='WAIT : les confirmations H4/M30/M15/M5/M1 ne sont pas toutes réunies. Il faut un contexte H4 aligné EMA200, une structure M30, les confirmations principales M15, puis un sweep M5 et un déclencheur M5 ou M1.';
  if((decision.decision==='BUY'&&direction!=='BUY')||(decision.decision==='SELL'&&direction!=='SELL'))decision={decision:'WAIT',reason:'Réponse IA rejetée : elle contredit le biais H4 calculé.',score,probability:null};
  const patterns=[...h4.patterns,...m30.patterns,...m15.patterns,...m5.patterns,...m1.patterns].map(x=>x.name);
  latest={message:stale.length?'Données reçues mais fraîcheur non confirmée':'Données OHLC reçues · H4 / M30 / M15 / M5 / M1',tableMessage:'',rows,score,scoreComponents,analysis:analyses,signalReason:`${decision.decision||'WAIT'} : ${decision.reason||'Aucune justification fournie.'}${patterns.length?' Figures détectées : '+[...new Set(patterns)].join(', ')+'.':''}`,decision:decision.decision||'WAIT',decisionDetails:decision,probability:null,frames};
  return {price:m1.last.close,status:'reçu'};
 }catch(error){latest={message:'Analyse indisponible',tableMessage:'Impossible de charger les cinq unités H4/M30/M15/M5/M1.',signalReason:'WAIT : '+error.message,decision:'WAIT',probability:null,score:null};return null;}
}
