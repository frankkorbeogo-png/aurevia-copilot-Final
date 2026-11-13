import { calculateLotsFromRisk } from './contract-engine.js';
export function calculatePositionRisk({balance=0,riskAmount,stopDistance,unitValuePerLot,lotStep=0.01,rewardDistance=null,marginPerLot=null,contractSpec=null}){
  if(contractSpec)return calculateLotsFromRisk({balance,riskAmount,stopDistance,contractSpec,rewardDistance});
  const nums=[riskAmount,stopDistance,unitValuePerLot,lotStep];
  if(!nums.every(Number.isFinite)||riskAmount<=0||stopDistance<=0||unitValuePerLot<=0||lotStep<=0)
    return {error:'Vérifiez le montant à risquer, la distance du stop, la valeur par lot et le pas de volume.'};
  const rawLots=riskAmount/(stopDistance*unitValuePerLot);
  const precision=Math.max(0,Math.min(8,(String(lotStep).split('.')[1]||'').length));
  const lots=Number((Math.floor((rawLots+1e-10)/lotStep)*lotStep).toFixed(precision));
  if(lots<=0)return {error:'Le montant à risquer est trop faible pour le volume minimum du broker.'};
  const riskMoney=lots*stopDistance*unitValuePerLot;
  const gain=Number.isFinite(rewardDistance)&&rewardDistance>0?lots*rewardDistance*unitValuePerLot:null;
  const rr=gain===null?null:gain/riskMoney;
  const riskPercentActual=Number.isFinite(balance)&&balance>0?riskMoney/balance*100:null;
  const margin=Number.isFinite(marginPerLot)&&marginPerLot>0?lots*marginPerLot:null;
  return {riskMoney,lots,lossPerLot:stopDistance*unitValuePerLot,gain,rr,riskPercentActual,margin,unusedRisk:Math.max(0,riskAmount-riskMoney)};
}
