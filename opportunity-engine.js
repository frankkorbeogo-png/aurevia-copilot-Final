const finite = Number.isFinite;
const round = (n, d=2) => Number.isFinite(n) ? Number(n.toFixed(d)) : null;
const biasFor = side => side === 'BUY' ? 'haussier' : 'baissier';

/** Scénarios conditionnels fondés sur plusieurs indices indépendants.
 * Le moteur ne transforme jamais un scénario candidat en ordre confirmé.
 */
export function generateOpportunityScenarios({analyses, frames, staleFrames=[]}) {
  const result = { buy: null, sell: null, engine: 'technical-candidate-v3-single-setup' };
  if (!analyses || !frames || staleFrames.length) return result;
  const current = analyses.M5?.last?.close ?? analyses.M15?.last?.close;
  const atr = analyses.M5?.indicators?.atr14 || analyses.M15?.indicators?.atr14;
  if (!finite(current) || !finite(atr) || atr <= 0) return result;

  const tfWeights = {H4:1.5,H1:1.5,M30:3,M15:2.5,M5:1};
  for (const side of ['BUY','SELL']) {
    const expected = biasFor(side);
    let score=0, operationalVotes=0, directionalVotes=0;
    const reasons=[], conditions=[], conflicts=[];
    for (const [tf,w] of Object.entries(tfWeights)) {
      const a=analyses[tf]; if (!a) continue;
      const bias=a.structure?.bias;
      if (bias===expected) {
        score += w*5; directionalVotes++;
        if (['M30','M15'].includes(tf)) operationalVotes++;
        reasons.push(`${tf} structure ${expected}`);
      } else if (bias && ['haussier','baissier'].includes(bias)) {
        conflicts.push(`${tf} structure ${bias}`);
      }
      const close=a.last?.close, ema=a.indicators?.ema200;
      if (finite(close)&&finite(ema)) {
        const aligned=side==='BUY'?close>ema:close<ema;
        if(aligned){score+=w*2.2;if(['M30','M15'].includes(tf))operationalVotes++;directionalVotes++;reasons.push(`${tf} prix ${side==='BUY'?'au-dessus':'au-dessous'} EMA200`);}
      }
      const hist=a.indicators?.macd?.histogram;
      if(finite(hist)&&(side==='BUY'?hist>0:hist<0)){
        score+=w*1.5;if(['M30','M15'].includes(tf))operationalVotes++;directionalVotes++;
        conditions.push(`MACD ${tf} orienté ${side}`);
      }
      const rsi=a.indicators?.rsi14;
      if(finite(rsi)&&(side==='BUY'?rsi>=50&&rsi<75:rsi<=50&&rsi>25)){
        score+=w*.9;if(['M30','M15'].includes(tf))operationalVotes++;
        conditions.push(`RSI ${tf} compatible (${round(rsi,1)})`);
      }
    }
    const m30=analyses.M30,m15=analyses.M15,m5=analyses.M5;
    const relevantBreak=[...(m30?.structure?.breaks||[]),...(m15?.structure?.breaks||[])].some(x=>String(x.type).toLowerCase().includes(expected));
    const sweep=(m5?.structure?.sweeps||[]).some(x=>side==='BUY'?String(x.type).includes('sell-side'):String(x.type).includes('buy-side'));
    const m5Trigger=(m5?.structure?.breaks||[]).some(x=>String(x.type).toLowerCase().includes(expected));
    if(relevantBreak){score+=10;conditions.push('BOS/CHoCH cohérent sur M30 ou M15');}
    if(sweep){score+=8;conditions.push('Sweep de liquidité M5');}
    if(m5Trigger){score+=10;conditions.push('Clôture M5 confirmant le déclencheur');}

    const structureBias=m30?.structure?.bias;
    if(structureBias && ['haussier','baissier'].includes(structureBias)&&structureBias!==expected){
      score-=10;conflicts.push(`M30 structure ${structureBias}`);
    }
    score=Math.max(0,Math.min(100,Math.round(score)));
    // Un seul côté BUY ou SELL peut suffire : on exige au moins une confluence
    // opérationnelle M30/M15 et un score minimal. Il n'est pas nécessaire que
    // les deux directions soient identifiées, ni que M30 et M15 soient toutes
    // deux alignées. H4/H1 pondèrent le contexte sans créer seuls un scénario.
    const hasOperationalEvidence=operationalVotes>=1 && score>=22;

    const swings=m15?.structure?.swings?.length?m15.structure.swings:(m30?.structure?.swings||[]);
    const highs=swings.filter(x=>x.type==='high').map(x=>x.price).filter(finite);
    const lows=swings.filter(x=>x.type==='low').map(x=>x.price).filter(finite);
    const pad=atr*.25,risk=atr*1.5;
    let entry=current,stop,targets;
    if(side==='BUY'){
      const support=lows.filter(x=>x<=current).at(-1);
      entry=support&&current-support<=atr*2?(support+current)/2:current+atr*.25;
      stop=Math.min(entry-risk,finite(support)?support-atr*.25:entry-risk);
      const r=Math.max(entry-stop,atr*.8);targets=[entry+r,entry+r*2,entry+r*3];
    }else{
      const resistance=highs.filter(x=>x>=current).at(-1);
      entry=resistance&&resistance-current<=atr*2?(resistance+current)/2:current-atr*.25;
      stop=Math.max(entry+risk,finite(resistance)?resistance+atr*.25:entry+risk);
      const r=Math.max(stop-entry,atr*.8);targets=[entry-r,entry-r*2,entry-r*3];
    }
    const conflictsText=conflicts.length?` Conflits à surveiller : ${conflicts.join('; ')}.`:'';
    const pendingOrderType=side==='BUY'?(entry<current?'BUY LIMIT':entry>current?'BUY STOP':null):(entry>current?'SELL LIMIT':entry<current?'SELL STOP':null);
    const orderPrice=round(entry);
    result[side.toLowerCase()]={status:hasOperationalEvidence?'IDENTIFIED':'WATCH',side,score,entryStatus:m5Trigger&&sweep?'CONFIRMED':'PENDING',
      confidenceLabel:hasOperationalEvidence?'Confluence technique détectée':'Plan indicatif · confirmations insuffisantes',
      probability:null,probabilityStatus:'NON_CALIBRÉE',
      pendingOrderType,triggerPrice:pendingOrderType?.includes('STOP')?orderPrice:null,limitPrice:pendingOrderType?.includes('LIMIT')?orderPrice:null,
      orderRationale:pendingOrderType?.includes('LIMIT')?'Ordre limite proposé sur la zone de repli (support/résistance) avant confirmation M5.':pendingOrderType?.includes('STOP')?'Ordre stop proposé au franchissement du niveau de déclenchement ; attendre la clôture M5 de confirmation.':'Type d’ordre non déterminable : zone confondue avec le prix actuel, attendre un meilleur emplacement.',
      entry:orderPrice,entryZoneLow:round(entry-pad),entryZoneHigh:round(entry+pad),stopLoss:round(stop),
      takeProfits:targets.map(x=>round(x)),
      reason:`Plan conditionnel ${side} calculé à partir du dernier cours et de l’ATR. ${operationalVotes} confirmation(s) opérationnelle(s) M30/M15. Score de confluence ${score}/100, non statistique. ${hasOperationalEvidence?'Confluence technique suffisante pour surveiller ce scénario.':'Confluence encore faible : niveaux indicatifs, ne pas traiter sans confirmations supplémentaires.'} ${reasons.join('; ')}.${conflictsText}`,
      activationConditions:[...conditions,'Attendre le retest de la zone et vérifier que la structure M30/M15 reste valide.'],
      entryTrigger:m5Trigger&&sweep?'Sweep et clôture M5 dans le sens du scénario détectés.':'Attendre un sweep de liquidité puis un BOS/CHoCH confirmé en clôture M5.',
      invalidation:`Invalidation si clôture au-delà du stop indicatif ${round(stop)} ou invalidation de la structure M30.`,
      riskReward:[1,2,3],dataBasis:'OHLC Twelve Data · prix indicatif Last Price · ATR M5/M15',
      warning:'Scénario candidat uniquement : aucun ordre n’est exécuté. Vérifier le prix, le spread et le risque.'};
  }
  return result;
}
