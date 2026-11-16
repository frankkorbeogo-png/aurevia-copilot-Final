export function validateM5AIConsensus({scenario,lead,review,audit,atr=null}){
 const direction=scenario?.direction;
 const price=Number(lead?.entryPrice),low=Number(lead?.entryZoneLow),high=Number(lead?.entryZoneHigh);
 const validPrice=Number.isFinite(price)&&price>0&&Number.isFinite(low)&&Number.isFinite(high)&&low<=price&&price<=high&&low>=Number(scenario.entryZoneLow)&&high<=Number(scenario.entryZoneHigh);
 const sl=Number(scenario.stopLoss),tp1=Number(scenario.takeProfits?.[0]);
 const levelsValid=direction==='BUY'?price>sl&&price<tp1:direction==='SELL'?price<sl&&price>tp1:false;
 const reviewPrice=Number(review?.entryPrice);
 const tolerance=Math.max(Math.abs(price)*0.00015,Number.isFinite(Number(atr))&&Number(atr)>0?Number(atr)*0.25:0);
 const priceAgreement=Number.isFinite(reviewPrice)&&Math.abs(reviewPrice-price)<=tolerance;
 const reviewClear=review?.decision==='CONFIRM'&&review?.verdict==='CONFIRME'&&priceAgreement;
 const auditClear=audit?.decision==='CONFIRM'&&audit?.veto===false&&!(audit?.criticalBlockers||[]).length;
 const blockers=[...(review?.criticalBlockers||[]),...(audit?.criticalBlockers||[])].filter(Boolean).slice(0,12);
 const scores=[Number(lead?.score),Number(review?.score),Number(audit?.score)];
 const allScores=scores.every(v=>Number.isFinite(v)&&v>=0&&v<=100);
 const score=allScores?Math.round(scores[0]*0.4+scores[1]*0.3+scores[2]*0.3):0;
 const confirmed=lead?.decision==='CONFIRM'&&reviewClear&&auditClear&&validPrice&&levelsValid&&Number(lead?.score)>=65&&Number(lead?.score)<=100&&Number(review?.score)>=60&&Number(review?.score)<=100&&Number(audit?.score)>=60&&Number(audit?.score)<=100&&!blockers.length;
 const components=[
  {label:'Proposition IA principale (Groq)',passed:lead?.decision==='CONFIRM'&&validPrice,weight:40,score:Number.isFinite(scores[0])?scores[0]:0,reasoning:String(lead?.reasoning||'').slice(0,300)},
  {label:'Contre-analyse et accord sur le prix (OpenRouter)',passed:reviewClear,weight:30,score:Number.isFinite(scores[1])?scores[1]:0,reasoning:String(review?.reasoning||'').slice(0,300)},
  {label:'Contrôle indépendant des risques (Cloudflare)',passed:auditClear,weight:30,score:Number.isFinite(scores[2])?scores[2]:0,reasoning:String(audit?.reasoning||audit?.vetoReason||'').slice(0,300)}
 ];
 const reasons=[];
 if(!validPrice)reasons.push('prix proposé absent ou hors de la zone M15');
 if(!levelsValid)reasons.push('prix incompatible avec le SL ou le TP1');
 if(!reviewClear)reasons.push(priceAgreement?'contre-analyse OpenRouter non concluante':'désaccord sur le prix entre Groq et OpenRouter');
 if(!auditClear)reasons.push(audit?.vetoReason||'contrôle Cloudflare non validé');
 if(!allScores)reasons.push('scores IA absents ou hors de l’intervalle 0–100');
 if(Number(lead?.score)<65||Number(review?.score)<60||Number(audit?.score)<60)reasons.push('seuil de qualité IA non atteint');
 if(blockers.length)reasons.push(...blockers);
 return {confirmed,score,entryReference:confirmed?price:null,entryZoneLow:validPrice?low:null,entryZoneHigh:validPrice?high:null,reason:confirmed?'Entrée M5 proposée par Groq, prix corroboré par OpenRouter et risque accepté par Cloudflare.': 'ATTENDRE : '+reasons.join(' ; '),components,priceAgreement,priceTolerance:tolerance,blockers};
}
