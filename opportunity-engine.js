const finite = Number.isFinite;
const round = (n, d=2) => finite(n) ? Number(n.toFixed(d)) : null;

/** M15 is the sole decision timeframe. Other timeframes are deliberately ignored. */
export function generateOpportunityScenarios({analyses, frames, staleFrames=[]}) {
  const m15=analyses?.M15;
  const candles=frames?.M15?.candles;
  const result={buy:null,sell:null,engine:'aurevia-m15-deterministic-v1',decisionTimeframe:'M15'};
  if(!m15?.last || !m15?.indicators || !Array.isArray(candles) || candles.length<30 || staleFrames.includes('M15')) return result;
  const price=m15.last.close, ind=m15.indicators, st=m15.structure||{};
  const atr=ind.atr14;
  if(!finite(price)||!finite(atr)||atr<=0) return result;
  const ema20=ind.ema20,ema50=ind.ema50,ema200=ind.ema200,rsi=ind.rsi14,macd=ind.macd?.histogram;
  const swings=st.swings||[], highs=swings.filter(x=>x.type==='high'&&finite(x.price)), lows=swings.filter(x=>x.type==='low'&&finite(x.price));
  const recentHigh=highs.at(-1)?.price, recentLow=lows.at(-1)?.price;
  const activeFvg=(st.fvg||[]).filter(x=>!x.mitigated), activeOb=(st.orderBlocks||[]).filter(x=>!x.mitigated);
  const bb=ind.bollinger;
  for(const side of ['BUY','SELL']){
    const buy=side==='BUY'; let score=0; const components=[];
    const add=(label,ok,weight)=>{components.push({label,passed:Boolean(ok),weight});if(ok)score+=weight;};
    add('Structure M15',st.bias===(buy?'haussier':'baissier'),20);
    add('Prix vs EMA20',finite(ema20)&&(buy?price>ema20:price<ema20),10);
    add('Prix vs EMA50',finite(ema50)&&(buy?price>ema50:price<ema50),10);
    add('Prix vs EMA200',finite(ema200)&&(buy?price>ema200:price<ema200),10);
    add('RSI M15',finite(rsi)&&(buy?rsi>=50&&rsi<=72:rsi<=50&&rsi>=28),10);
    add('MACD M15',finite(macd)&&(buy?macd>0:macd<0),10);
    const br=(st.breaks||[]).some(x=>String(x.type).toLowerCase().includes(buy?'haussier':'baissier'));
    add('BOS / CHoCH confirmé M15',br,10);
    const sweep=(st.sweeps||[]).some(x=>buy?String(x.type).includes('sell-side'):String(x.type).includes('buy-side'));
    add('Sweep de liquidité M15',sweep,5);
    const pattern=(m15.patterns||[]).some(x=>{const n=String(x.name||'').toLowerCase();return buy?/bull|hauss|morning|hammer|engulf|breakout/.test(n):/bear|baiss|evening|shooting|engulf|breakdown/.test(n);});
    add('Figure M15 compatible',pattern,5);
    const zone=buy?activeOb.find(x=>x.type?.includes('bullish'))||activeFvg.find(x=>x.type?.includes('bullish')):activeOb.find(x=>x.type?.includes('bearish'))||activeFvg.find(x=>x.type?.includes('bearish'));
    add('Zone technique M15',Boolean(zone),5);
    add('Alignement EMA20 / EMA50',finite(ema20)&&finite(ema50)&&(buy?ema20>ema50:ema20<ema50),5);
    score=Math.max(0,Math.min(100,Math.round(score)));
    const directionOk=st.bias===(buy?'haussier':'baissier') || br || (finite(ema20)&&finite(ema50)&&(buy?ema20>ema50:ema20<ema50));
    const identified=directionOk&&score>=45;
    let entry=price, stop, targets, zoneLow,zoneHigh;
    if(zone&&finite(zone.low)&&finite(zone.high)){zoneLow=Math.min(zone.low,zone.high);zoneHigh=Math.max(zone.low,zone.high);entry=(zoneLow+zoneHigh)/2;}
    else if(buy){entry=price-atr*.15;zoneLow=entry-atr*.2;zoneHigh=entry+atr*.2;}
    else{entry=price+atr*.15;zoneLow=entry-atr*.2;zoneHigh=entry+atr*.2;}
    const risk=Math.max(atr*1.25,Math.abs(entry-(buy?recentLow:recentHigh)||0)+atr*.2);
    stop=buy?Math.min(entry-risk,finite(recentLow)?recentLow-atr*.15:entry-risk):Math.max(entry+risk,finite(recentHigh)?recentHigh+atr*.15:entry+risk);
    const r=Math.abs(entry-stop);targets=buy?[entry+r,entry+r*2,entry+r*3]:[entry-r,entry-r*2,entry-r*3];
    const entryBeforeOrderSelection=entry;
    let order=null,triggerPrice=null,limitPrice=null;
    const priceInsideZone=Boolean(zone)&&price>=zoneLow&&price<=zoneHigh;
    if(priceInsideZone||Math.abs(entry-price)<=atr*.08){order=buy?'BUY MARKET':'SELL MARKET';entry=price;}
    else if(buy&&entry>price&&br){order='BUY STOP LIMIT';triggerPrice=round(Math.max(price+atr*.25,entry+atr*.05));limitPrice=round(Math.min(entry,triggerPrice-atr*.05));entry=limitPrice;}
    else if(!buy&&entry<price&&br){order='SELL STOP LIMIT';triggerPrice=round(Math.min(price-atr*.25,entry-atr*.05));limitPrice=round(Math.max(entry,triggerPrice+atr*.05));entry=limitPrice;}
    else if(buy)order=entry<price?'BUY LIMIT':'BUY STOP';
    else order=entry>price?'SELL LIMIT':'SELL STOP';
    if(order?.endsWith('STOP')&&!order.endsWith('STOP LIMIT'))triggerPrice=round(entry);
    if(order?.endsWith('LIMIT')&&!order.endsWith('STOP LIMIT'))limitPrice=round(entry);
    if(entry!==entryBeforeOrderSelection){const adjustedRisk=risk;stop=buy?entry-adjustedRisk:entry+adjustedRisk;targets=buy?[entry+adjustedRisk,entry+adjustedRisk*2,entry+adjustedRisk*3]:[entry-adjustedRisk,entry-adjustedRisk*2,entry-adjustedRisk*3];}
    const validOrder=Boolean(order)&&finite(stop)&&targets.every(finite)&&(!order.endsWith('STOP LIMIT')||(finite(triggerPrice)&&finite(limitPrice)));
    const status=identified&&validOrder?'IDENTIFIED':'WATCH';
    result[side.toLowerCase()]={status,side,score,scenarioScore:score,scoreComponents:components,scenarioScoreComponents:components,confidenceLabel:status==='IDENTIFIED'?'Configuration M15 détectée':'Configuration M15 à confirmer',entryStatus:'WAITING_TRIGGER',probability:null,probabilityStatus:'NON_CALIBRÉE',pendingOrderType:validOrder?order:null,triggerPrice:validOrder?triggerPrice:null,limitPrice:validOrder?limitPrice:null,orderRationale:validOrder?(order.endsWith('MARKET')?'Prix actuellement dans la zone : proposition au marché, à exécuter manuellement.':order.endsWith('STOP LIMIT')?'Déclenchement stop suivi d’une limite : les deux prix sont conservés.':order.includes('LIMIT')?'Zone de repli M15 : ordre limite indicatif.':'Franchissement d’un niveau M15 : ordre stop indicatif.'):'Les niveaux ne permettent pas de définir un ordre cohérent.',entry:validOrder?round(entry):null,entryZoneLow:round(zoneLow),entryZoneHigh:round(zoneHigh),stopLoss:round(stop),takeProfits:targets.map(x=>round(x)),reason:`Analyse exclusivement M15. Score de confluence technique ${score}/100 (pas une probabilité). ${components.filter(x=>x.passed).map(x=>x.label).join(', ')||'Aucun facteur validé'}.`,activationConditions:components.filter(x=>!x.passed).map(x=>`Confirmer : ${x.label}`),entryTrigger:'Attendre une clôture M15 qui confirme le sens du scénario ; la surveillance analysera ensuite M5 après mitigation pour valider l’entrée, sans modifier le score initial M15.',invalidation:`Invalidation si clôture M15 au-delà du Stop Loss ${round(stop)} ou rupture de la structure M15.`,riskReward:[1,2,3],dataBasis:'OHLC M15 · indicateurs M15 · ATR M15',warning:'Proposition indicative uniquement. Aucune exécution automatique.'};
  }
  return result;
}
