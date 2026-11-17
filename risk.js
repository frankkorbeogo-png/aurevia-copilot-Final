const lotPrecision=value=>{const [mantissa,exponent]=String(value).toLowerCase().split('e');return Math.max(0,Math.min(10,(mantissa.split('.')[1]||'').length-Number(exponent||0)));};
export function calculatePositionRisk({balance=0,riskAmount,stopDistance,unitValuePerLot,quoteToAccount=1,rewardDistance=null,entryPrice=null,leverage=null,minLot=0.01,lotStep=0.01,maxLot=null}){
  if(!Number.isFinite(minLot)||minLot<=0||!Number.isFinite(lotStep)||lotStep<=0||(maxLot!==null&&(!Number.isFinite(maxLot)||maxLot<minLot)))return {error:'Vérifiez le lot minimum, le pas de volume et le lot maximum.'};
  const nums=[riskAmount,stopDistance,unitValuePerLot,quoteToAccount];
  if(!nums.every(Number.isFinite)||riskAmount<=0||stopDistance<=0||unitValuePerLot<=0||quoteToAccount<=0)
    return {error:'Vérifiez le risque, la distance du stop, la valeur par lot et le taux de conversion.'};
  // unitValuePerLot is expressed in the instrument quote currency; convert it to the account currency.
  const accountUnitValuePerLot=unitValuePerLot*quoteToAccount;
  const rawLots=riskAmount/(stopDistance*accountUnitValuePerLot);
  const precision=lotPrecision(lotStep);
  let lots=Number((Math.floor((rawLots+1e-10)/lotStep)*lotStep).toFixed(precision));
  if(lots<minLot)return {error:`Le risque saisi est trop faible pour atteindre le lot minimum de ${Number(minLot).toLocaleString('fr-FR')}.`};
  if(maxLot!==null&&lots>maxLot)lots=Number((Math.floor((maxLot+1e-10)/lotStep)*lotStep).toFixed(precision));
  if(lots<minLot)return {error:'Le lot maximum ne permet pas de respecter le lot minimum et le pas de volume.'};
  const riskMoney=lots*stopDistance*accountUnitValuePerLot;
  const gain=Number.isFinite(rewardDistance)&&rewardDistance>0?lots*rewardDistance*accountUnitValuePerLot:null;
  const rr=gain===null?null:gain/riskMoney;
  const riskPercentActual=Number.isFinite(balance)&&balance>0?riskMoney/balance*100:null;
  // Estimation indicative : valeur par lot/unité de prix × prix d'entrée = notionnel estimé.
  const margin=Number.isFinite(entryPrice)&&entryPrice>0&&Number.isFinite(leverage)&&leverage>0
    ?lots*accountUnitValuePerLot*entryPrice/leverage:null;
  return {riskMoney,lots,lossPerLot:stopDistance*accountUnitValuePerLot,gain,rr,riskPercentActual,margin,unusedRisk:Math.max(0,riskAmount-riskMoney)};
}


export function calculateRiskControls({
  equity,
  marginUsed,
  peakEquity,
  dailyLossLimit=0,
  weeklyLossLimit=0,
  dailyPnl=0,
  weeklyPnl=0
}={}){
  const values={equity,marginUsed,peakEquity,dailyLossLimit,weeklyLossLimit,dailyPnl,weeklyPnl};
  for(const [name,value] of Object.entries(values)){
    if(!Number.isFinite(Number(value)))return {error:'Valeur financière invalide : '+name+'.'};
  }
  const currentEquity=Number(equity),used=Number(marginUsed),peak=Math.max(Number(peakEquity),currentEquity);
  const dailyLimit=Number(dailyLossLimit),weeklyLimit=Number(weeklyLossLimit);
  if(currentEquity<0||used<0||peak<0||dailyLimit<0||weeklyLimit<0)return {error:'Les soldes, marges et limites doivent être positifs ou nuls.'};
  const dayPnl=Number(dailyPnl),weekPnl=Number(weeklyPnl);
  const dailyLossUsed=Math.max(0,-dayPnl),weeklyLossUsed=Math.max(0,-weekPnl);
  const dailyLossRemaining=dailyLimit>0?Math.max(0,dailyLimit-dailyLossUsed):null;
  const weeklyLossRemaining=weeklyLimit>0?Math.max(0,weeklyLimit-weeklyLossUsed):null;
  const drawdownAmount=Math.max(0,peak-currentEquity);
  const drawdownPercent=peak>0?drawdownAmount/peak*100:null;
  return {
    freeMargin:currentEquity-used,
    dailyPnl:dayPnl,
    weeklyPnl:weekPnl,
    dailyLossUsed,
    weeklyLossUsed,
    dailyLossRemaining,
    weeklyLossRemaining,
    dailyLimitEnabled:dailyLimit>0,
    weeklyLimitEnabled:weeklyLimit>0,
    dailyLimitReached:dailyLimit>0&&dailyLossUsed>=dailyLimit,
    weeklyLimitReached:weeklyLimit>0&&weeklyLossUsed>=weeklyLimit,
    drawdownAmount,
    drawdownPercent,
    peakEquity:peak
  };
}
