const finite = Number.isFinite;
const round = (n, d=2) => Number.isFinite(n) ? Number(n.toFixed(d)) : null;
const biasFor = side => side === 'BUY' ? 'haussier' : 'baissier';

/** Génération déterministe de scénarios candidats. Ce score mesure les confluences,
 * jamais une probabilité de réussite. Les prix sont indicatifs et issus des OHLC reçus.
 */
export function generateOpportunityScenarios({analyses, frames, staleFrames=[]}) {
  const result = { buy: null, sell: null, engine: 'technical-candidate-v1' };
  if (!analyses || !frames || staleFrames.length) return result;
  const current = analyses.M5?.last?.close;
  const atr = analyses.M5?.indicators?.atr14 || analyses.M15?.indicators?.atr14;
  if (!finite(current) || !finite(atr) || atr <= 0) return result;
  const tfWeights = {H4:2,H1:2,M30:3,M15:2,M5:1};
  for (const side of ['BUY','SELL']) {
    const expected = biasFor(side); let score=0; const reasons=[], conditions=[];
    for (const [tf,w] of Object.entries(tfWeights)) {
      const a=analyses[tf]; if (!a) continue;
      const aligned=a.structure?.bias===expected;
      if (aligned) { score += w*5; reasons.push(`${tf} ${expected}`); }
      else if (a.structure?.bias && !['range','indéterminé','neutre'].includes(a.structure.bias)) reasons.push(`${tf} en conflit (${a.structure.bias})`);
      const macd=a.indicators?.macd;
      if (finite(a.indicators?.ema200) && (side==='BUY'?a.last.close>a.indicators.ema200:a.last.close<a.indicators.ema200)) score += w*1.5;
      if (macd && finite(macd.histogram) && (side==='BUY'?macd.histogram>0:macd.histogram<0)) score += w;
    }
    const m30=analyses.M30, m15=analyses.M15, m5=analyses.M5;
    const relevantBreak=[...(m30?.structure?.breaks||[]),...(m15?.structure?.breaks||[])].some(x=>String(x.type).includes(expected));
    const sweep=(m5?.structure?.sweeps||[]).some(x=>side==='BUY'?String(x.type).includes('sell-side'):String(x.type).includes('buy-side'));
    const m5Trigger=(m5?.structure?.breaks||[]).some(x=>String(x.type).includes(expected));
    if(relevantBreak){score+=10;conditions.push('Cassure BOS/CHoCH cohérente sur M30 ou M15');}
    if(sweep){score+=8;conditions.push('Sweep de liquidité dans le sens du scénario sur M5');}
    if(m5Trigger){score+=10;conditions.push('Clôture M5 confirmant le déclencheur');}
    const rsi=m15?.indicators?.rsi14;
    if(finite(rsi) && (side==='BUY'?rsi>=50&&rsi<75:rsi<=50&&rsi>25)){score+=5;conditions.push(`RSI M15 compatible (${round(rsi,1)})`);}
    const structureBias=m30?.structure?.bias;
    if(structureBias!==expected && !['range','indéterminé','neutre',undefined].includes(structureBias)) score-=12;
    score=Math.max(0,Math.min(100,Math.round(score)));
    // A candidate requires directional context from M30/H1 and at least 30 confluence points.
    const directional=[analyses.H4?.structure?.bias,analyses.H1?.structure?.bias,structureBias].includes(expected);
    if(!directional || score<30) continue;
    const swings=m15?.structure?.swings||m30?.structure?.swings||[];
    const highs=swings.filter(x=>x.type==='high').map(x=>x.price).filter(finite);
    const lows=swings.filter(x=>x.type==='low').map(x=>x.price).filter(finite);
    const pad=atr*0.25, risk=atr*1.5;
    let entry=current, stop, targets;
    if(side==='BUY'){
      const support=lows.filter(x=>x<=current).at(-1);
      entry=support&&current-support<=atr*2?(support+current)/2:current;
      stop=Math.min(entry-risk, finite(support)?support-atr*.25:entry-risk);
      const r=Math.max(entry-stop,atr*.8); targets=[entry+r,entry+r*2,entry+r*3];
    } else {
      const resistance=highs.filter(x=>x>=current).at(-1);
      entry=resistance&&resistance-current<=atr*2?(resistance+current)/2:current;
      stop=Math.max(entry+risk, finite(resistance)?resistance+atr*.25:entry+risk);
      const r=Math.max(stop-entry,atr*.8); targets=[entry-r,entry-r*2,entry-r*3];
    }
    const entryLow=entry-pad,entryHigh=entry+pad;
    const conflicts=reasons.filter(x=>x.includes('conflit'));
    result[side.toLowerCase()]={status:'IDENTIFIED',side,score,entryStatus:m5Trigger&&sweep?'CONFIRMED':'PENDING',entry:round(entry),entryZoneLow:round(entryLow),entryZoneHigh:round(entryHigh),stopLoss:round(stop),takeProfits:targets.map(x=>round(x)),reason:`Configuration candidate ${side} détectée par le moteur technique. Score de confluence ${score}/100 (ce n’est pas une probabilité). ${reasons.join('; ')}.`,activationConditions:[...conditions,'Vérifier le retest de la zone et le maintien de la structure avant toute décision.',...(conflicts.length?[`Résoudre les conflits : ${conflicts.join('; ')}`]:[])],entryTrigger:m5Trigger?'Clôture M5 dans le sens du scénario détectée.':'Attendre un sweep puis un BOS/CHoCH confirmé sur M5.',invalidation:`Clôture au-delà du stop indicatif ${round(stop)} ou invalidation de la structure M30.`,riskReward:[1,2,3],dataBasis:'OHLC fournisseur · prix indicatif Last Price · ATR M5/M15',warning:'Scénario candidat non exécutable. Confirmer les données, le spread réel et le risque avant toute saisie.'};
  }
  return result;
}
