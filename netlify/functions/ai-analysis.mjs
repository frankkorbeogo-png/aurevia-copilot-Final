import {verifyBearerUser,assertActiveSession,json} from './_session-auth.mjs';
import {getMarketStatus} from '../../market-hours.js';
import {runAureviaAI} from './_ai-provider.mjs';
const finite=n=>Number.isFinite(Number(n));
// Réduit les blocs de contexte facultatifs sans supprimer les données techniques utiles.
function compactAIContext(value, depth=0) {
 if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
 if (typeof value === 'string') return value.slice(0, 320);
 if (depth >= 4) return Array.isArray(value) ? value.length : '[contexte détaillé omis]';
 if (Array.isArray(value)) return value.slice(-8).map(v=>compactAIContext(v,depth+1));
 if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0,18).map(([k,v])=>[k,compactAIContext(v,depth+1)]));
 return String(value).slice(0,180);
}
const allowed=new Set(['XAUUSD','XAGUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','BTCUSD','ETHUSD']);
export function cleanScenario(x,side,price){
 if(!x||x.direction!==side||!['BUY','SELL'].includes(x.direction))return null;
 const low=Number(x.entryZone?.low),high=Number(x.entryZone?.high),entry=Number(x.entry),sl=Number(x.stopLoss),tps=(x.takeProfits||[]).slice(0,3).map(Number),prob=x.estimatedWinRate==null?null:Number(x.estimatedWinRate);
 if(![low,high,entry,sl,...tps].every(Number.isFinite)||low<=0||high<low||entry<low||entry>high||sl<=0||!tps.length||(prob!==null&&(!Number.isFinite(prob)||prob<5||prob>95)))return null;
 if(side==='BUY'?(sl>=entry||tps.some(v=>v<=entry)):(sl<=entry||tps.some(v=>v>=entry)))return null;
 if(Math.abs(entry-price)>price*.08||Math.abs(sl-entry)>price*.05||Math.abs(high-low)>price*.03)return null;
 return {status:'IDENTIFIED',side,score:Math.max(0,Math.min(100,Math.round(Number(x.confirmationScore)||0))),scoreComponents:[],confidenceLabel:'Proposition AUREVIA · à valider',entryStatus:'WAITING_TRIGGER',probability:prob===null?null:Math.round(prob),probabilityStatus:prob===null?'NON_FOURNIE':'ESTIMATION_IA_NON_CALIBREE',probabilityRationale:String(x.probabilityRationale||(prob===null?'Aucune estimation fournie.':'Estimation subjective d’AUREVIA, non calibrée statistiquement.')).slice(0,1200),pendingOrderType:String(x.orderType||'').slice(0,20),entry,entryZoneLow:low,entryZoneHigh:high,stopLoss:sl,takeProfits:tps,reason:String(x.reason||'').slice(0,3000),humanReasoning:String(x.humanReasoning||'').slice(0,5000),activationConditions:Array.isArray(x.activationConditions)?x.activationConditions.slice(0,8).map(v=>String(v).slice(0,240)):[],entryTrigger:String(x.entryTrigger||'Attendre la clôture confirmatrice M15.').slice(0,600),invalidation:String(x.invalidation||'Scénario invalidé si le SL ou la structure M15 est franchi.').slice(0,600),riskReward:tps.map(v=>Number((Math.abs(v-entry)/Math.abs(entry-sl)).toFixed(2))),dataBasis:'Bougies OHLC M15 exclusivement',warning:'Estimation IA non calibrée ; proposition indicative, aucune exécution automatique.'};
}
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON invalide.'});}
 let ctx;try{ctx=await verifyBearerUser(event);await assertActiveSession(ctx);}catch(e){return json(e.statusCode||401,{error:e.message||'Session invalide.'});}
 const {instrument,m15,context={}}=body;
 if(!allowed.has(instrument)||!m15||!Array.isArray(m15.candles)||m15.candles.length<60)return json(400,{error:'Données M15 insuffisantes pour le raisonnement.'});
 const marketStatus=getMarketStatus(instrument);if(!marketStatus.tradable)return json(409,{error:'Marché fermé pour le week-end. Aucune directive de trading ne peut être générée avant la réouverture.',code:'MARKET_CLOSED',marketStatus});
 const candles=m15.candles.slice(-40).map(c=>({t:c.time,o:Number(c.open),h:Number(c.high),l:Number(c.low),c:Number(c.close),v:c.volume==null?null:Number(c.volume)}));
 if(candles.some(c=>![c.o,c.h,c.l,c.c].every(Number.isFinite)||c.h<Math.max(c.o,c.c)||c.l>Math.min(c.o,c.c)))return json(400,{error:'Bougies M15 invalides.'});
 const last=candles.at(-1),prior=candles.at(-2);if(Date.now()-Date.parse(last.t)>35*60*1000||Date.parse(last.t)>Date.now()+5*60*1000)return json(409,{error:'Dernière bougie M15 trop ancienne ou horodatage invalide.'});
 const payload={instrument,decisionTimeframe:'M15',candles,indicators:compactAIContext(m15.indicators||{}),structure:compactAIContext(m15.structure||{}),patterns:compactAIContext((m15.patterns||[]).slice(-8)),volumeProfile:compactAIContext(m15.volumeProfile||null),fibonacci:compactAIContext(m15.fibonacci||null),price:last.c,previousClose:prior.c,context:{timeframes:compactAIContext(context.timeframes||{}),macro:compactAIContext(context.macro||'non disponible')}};
  const system=`AUREVIA COPILOT — analyste multi-actifs. Réponds en français, uniquement en JSON valide. Aucune exécution d'ordre.
OBJECTIF: décider BUY, SELL ou WAIT à partir d'une lecture réelle du marché, sans exiger une confluence parfaite.
HIÉRARCHIE MULTI-UNITÉS: confronte H4 (biais majeur), H1 (confirmation intermédiaire), M30 (structure et préparation) et M15 (validation du scénario). M15 reste l'unité qui décide si un scénario est défendable; H4/H1/M30 ne doivent jamais imposer mécaniquement WAIT ni être ignorés. Explique explicitement les accords, divergences et leur signification (correction, continuation ou retournement). Les unités indisponibles sont neutres, jamais inventées. L'entrée n'est PAS immédiate: propose une zone d'opportunité et attends sa mitigation; après mitigation, la surveillance séparée vérifie M5 puis M1 avant de notifier une entrée. Ne prétends pas que M5/M1 ont été confirmés dans cette analyse si leurs données ne sont pas fournies.
LECTURE TECHNIQUE: confronte pour chaque unité disponible le biais, EMA20/50/200, RSI, MACD, BOS/CHoCH et sweeps fournis. M15 doit être étudié plus en profondeur avec OHLC, Bollinger, ATR, structure, liquidité, supports/résistances et figures confirmées lorsqu'ils sont présents. Pondère les divergences; n'exige pas l'alignement de tous les indicateurs. Ne fabrique aucune donnée.
FIBONACCI et Volume Profile (POC/VAH/VAL/HVN/LVN) sont facultatifs: leur absence ne doit jamais provoquer WAIT. Utilise-les seulement s'ils sont présents et utiles.
CONTEXTE FONDAMENTAL POUR TOUS LES INSTRUMENTS: macro, DXY, rendements, calendrier et actualités ne sont JAMAIS une condition obligatoire pour proposer BUY/SELL; ils restent facultatifs/non bloquants. Pour les paires, considère devise de base et cotation; pour actifs USD, le canal USD sans corrélation parfaite. Après une annonce, compare réel/prévision/précédent si fournis, puis analyse la réaction réellement observée dans les prix. FRED peut être retardé: respecte ses dates. Une annonce peut justifier prudence/timing, jamais WAIT automatiquement.
DÉCISION: BUY/SELL si le M15 présente une direction identifiable avec entrée et invalidation raisonnables. WAIT seulement si M15 est réellement indécis ou si les données M15 essentielles manquent/sont périmées. Si le risque événementiel est excessif, explique NO TRADE dans risks sans inventer de signal.
SCÉNARIO: définis une vraie zone d'opportunité de mitigation (OB/FVG/support-résistance ou zone de liquidité appuyée par les données), avec bornes précises. Le prix actuel ne doit pas être présenté comme une entrée exécutée si la zone n'a pas été revisitée. Fournis un prix d'entrée indicatif situé dans la zone, SL derrière l'invalidation structurelle, 1 à 3 TP et RR cohérent. Activation = mitigation puis confirmation M5 et M1 gérées par le surveillant; aucun signal d'entrée immédiat avant cela. Le score confirmationScore (0-100) mesure la confluence technique, pas une probabilité. estimatedWinRate doit être null si non estimable honnêtement; si fourni, il reste subjectif et non calibré statistiquement.
FORMAT JSON exact: {decision:"BUY|SELL|WAIT",summary,marketReading,buy,sell,risks:[],missingData:[]}. buy/sell = objet ou null. Chaque scénario: {direction,entryZone:{low,high},entry,stopLoss,takeProfits:[],orderType:"BUY LIMIT|BUY STOP|SELL LIMIT|SELL STOP",confirmationScore,estimatedWinRate:null|number,probabilityRationale,reason,humanReasoning,activationConditions:[],entryTrigger,invalidation}. Ne force jamais les deux directions. Donne des prix cohérents avec le dernier cours M15.`;
 try {
   const result=await runAureviaAI({messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}],temperature:0.25,max_tokens:1800});
   const out=result.data;
   const buy=cleanScenario(out.buy,'BUY',last.c),sell=cleanScenario(out.sell,'SELL',last.c);
   let decision=['BUY','SELL','WAIT'].includes(out.decision)?out.decision:'WAIT';
   if(decision==='BUY'&&!buy)decision='WAIT';if(decision==='SELL'&&!sell)decision='WAIT';
   return json(200,{decision,summary:String(out.summary||'').slice(0,2500),marketReading:String(out.marketReading||'').slice(0,5000),risks:Array.isArray(out.risks)?out.risks.slice(0,10):[],missingData:Array.isArray(out.missingData)?out.missingData.slice(0,10):[],scenarios:{buy,sell},provider:'AUREVIA',decisionTimeframe:'M15',probabilityDisclaimer:'Estimation subjective non calibrée statistiquement. À ne pas interpréter comme une fréquence de réussite démontrée.'});
 } catch(e) {
   console.error('[AUREVIA ai-analysis] échec multi-fournisseur',JSON.stringify({code:e.code,attempts:e.attempts||[]}));
   return json(e.statusCode||502,{error:e.message||'Moteur IA temporairement indisponible.',code:e.code||'AI_ERROR',retryable:true,providerDiagnostics:{attempts:e.attempts||[],elapsedMs:e.elapsedMs||null}});
 }

}