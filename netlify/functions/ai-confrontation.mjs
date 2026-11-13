import {verifyBearerUser,assertActiveSession,json} from './_session-auth.mjs';
import {runAureviaAI} from './_ai-provider.mjs';
const clean=(v,max=1800)=>String(v??'').trim().slice(0,max);
const allowed=new Set(['XAUUSD','XAGUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','US30','NAS100','SPX500','BTCUSD','ETHUSD']);
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON invalide.'});}
 let ctx;try{ctx=await verifyBearerUser(event);await assertActiveSession(ctx);}catch(e){return json(e.statusCode||401,{error:e.message||'Session invalide.'});}
 const {instrument,userAnalysis,aiAnalysis}=body||{};if(!allowed.has(instrument)||!userAnalysis||!aiAnalysis)return json(400,{error:'Analyse personnelle ou analyse initiale manquante.'});
 const user={timeframe:clean(userAnalysis.timeframe,10),direction:clean(userAnalysis.direction,10),entry:clean(userAnalysis.entry,40),zoneLow:clean(userAnalysis.zoneLow,40),zoneHigh:clean(userAnalysis.zoneHigh,40),orderType:clean(userAnalysis.orderType,30),sl:clean(userAnalysis.sl,40),tp:clean(userAnalysis.tp,120),structure:clean(userAnalysis.structure),reason:clean(userAnalysis.reason,3000),invalidation:clean(userAnalysis.invalidation,1200)};
 const ai={decision:clean(aiAnalysis.decision,10),summary:clean(aiAnalysis.summary,2500),marketReading:clean(aiAnalysis.marketReading,3500),scenarios:aiAnalysis.scenarios||{},risks:Array.isArray(aiAnalysis.risks)?aiAnalysis.risks.slice(0,8).map(x=>clean(x,300)):[]};
 const system=`Tu es le second analyste senior indépendant d'AUREVIA. Tu conduis une véritable confrontation intellectuelle entre ton analyse de marché initiale et celle du trader. Ne cherche jamais à lui faire plaisir et ne défends pas ton premier avis par ego. Identifie précisément accords, désaccords, hypothèses, éléments oubliés et informations manquantes. Dis explicitement si son observation améliore ton analyse, si tu maintiens ton avis ou si tu révises ta conclusion. La décision et les niveaux chiffrés de trading restent fondés sur M15 uniquement ; le timeframe choisi par le trader est son point de vue et doit être contextualisé sans fusionner ses chiffres aux calculs M15. Ne fabrique aucun prix, aucune donnée ni probabilité. Tu peux recommander de conserver, surveiller ou rejeter un scénario, mais ne modifie pas les niveaux chiffrés dans cette confrontation : toute modification de niveaux nécessitera une nouvelle analyse M15. Rédige une synthèse humaine, nuancée et exploitable en français. Réponds uniquement en JSON valide avec les clés: verdict (ACCORD|DESACCORD|PARTIEL|REVISION|INSUFFISANT), agreements (array), disagreements (array), overlooked (array), traderContribution (string), groqPosition (string), finalConclusion (string), watchConditions (array), summary (string).`;
 try {
  const result=await runAureviaAI({messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({instrument,decisionTimeframe:'M15',aiAnalysis:ai,traderAnalysis:user})}],temperature:0.35,max_tokens:2200});
  const out=result.data;
  const arr=k=>Array.isArray(out[k])?out[k].slice(0,8).map(x=>clean(x,500)):[];
  return json(200,{provider:'AUREVIA',instrument,timeframe:'M15',verdict:['ACCORD','DESACCORD','PARTIEL','REVISION','INSUFFISANT'].includes(out.verdict)?out.verdict:'PARTIEL',agreements:arr('agreements'),disagreements:arr('disagreements'),overlooked:arr('overlooked'),traderContribution:clean(out.traderContribution,1800),groqPosition:clean(out.groqPosition,1800),finalConclusion:clean(out.finalConclusion,2400),watchConditions:arr('watchConditions'),summary:clean(out.summary,4000),numericLevelsChanged:false,notice:'Les niveaux M15 initiaux restent inchangés ; une nouvelle analyse est requise pour les recalculer.'});
 } catch(error) {
  console.error('[AUREVIA ai-confrontation] échec multi-fournisseur',JSON.stringify({code:error.code,attempts:error.attempts||[]}));
  return json(error.statusCode||502,{error:error.message||'Moteur IA temporairement indisponible.',code:error.code||'AI_ERROR'});
 }
}
