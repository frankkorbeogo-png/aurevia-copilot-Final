export function calculatePositionRisk({balance=0,riskAmount,stopDistance,unitValuePerLot,quoteToAccount=1,rewardDistance=null,entryPrice=null,leverage=null}){
  const lotStep=0.01;
  const nums=[riskAmount,stopDistance,unitValuePerLot,quoteToAccount];
  if(!nums.every(Number.isFinite)||riskAmount<=0||stopDistance<=0||unitValuePerLot<=0||quoteToAccount<=0)
    return {error:'Vérifiez le risque, la distance du stop, la valeur par lot et le taux de conversion.'};
  // unitValuePerLot is expressed in the instrument quote currency; convert it to the account currency.
  const accountUnitValuePerLot=unitValuePerLot*quoteToAccount;
  const rawLots=riskAmount/(stopDistance*accountUnitValuePerLot);
  const precision=Math.max(0,Math.min(8,(String(lotStep).split('.')[1]||'').length));
  const lots=Number((Math.floor((rawLots+1e-10)/lotStep)*lotStep).toFixed(precision));
  if(lots<0.01)return {error:'Le montant à risquer est trop faible pour atteindre le lot minimum de 0,01.'};
  const riskMoney=lots*stopDistance*accountUnitValuePerLot;
  const gain=Number.isFinite(rewardDistance)&&rewardDistance>0?lots*rewardDistance*accountUnitValuePerLot:null;
  const rr=gain===null?null:gain/riskMoney;
  const riskPercentActual=Number.isFinite(balance)&&balance>0?riskMoney/balance*100:null;
  // Estimation indicative : valeur par lot/unité de prix × prix d'entrée = notionnel estimé.
  const margin=Number.isFinite(entryPrice)&&entryPrice>0&&Number.isFinite(leverage)&&leverage>0
    ?lots*accountUnitValuePerLot*entryPrice/leverage:null;
  return {riskMoney,lots,lossPerLot:stopDistance*accountUnitValuePerLot,gain,rr,riskPercentActual,margin,unusedRisk:Math.max(0,riskAmount-riskMoney)};
}
