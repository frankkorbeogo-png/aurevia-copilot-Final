/** Score de confirmation technique explicable — jamais une probabilité statistique.
 * H4 = biais, M30 = structure, M15 = analyse centrale, M5/M1 = timing d'entrée.
 */
export function evaluateConfluence({ h4, m30, m15, m5, m1 }) {
  // M30/M15 pilotent la direction opérationnelle. H4 reste un contexte supérieur.
  const b30=m30?.structure?.bias, b15=m15?.structure?.bias;
  const direction=b30==='haussier'?'BUY':b30==='baissier'?'SELL':(b15==='haussier'?'BUY':b15==='baissier'?'SELL':null);
  const word=direction==='BUY'?'haussier':'baissier';
  const m30Break=Boolean(direction&&(m30?.structure?.breaks||[]).some(x=>String(x.type).includes(word)));
  const m15Aligned=Boolean(direction&&(b15===b30||b15=== (direction==='BUY'?'haussier':'baissier')));
  const m15Break=Boolean(direction&&(m15?.structure?.breaks||[]).some(x=>String(x.type).includes(word)));
  const h4Aligned=Boolean(direction&&h4?.structure?.bias===(direction==='BUY'?'haussier':'baissier'));
  const h4Ema=Number.isFinite(h4?.indicators?.ema200)&&Number.isFinite(h4?.last?.close)&&(direction==='BUY'?h4.last.close>h4.indicators.ema200:h4.last.close<h4.indicators.ema200);
  const m5Sweep=Boolean(direction&&(m5?.structure?.sweeps||[]).some(x=>direction==='BUY'?String(x.type).includes('sell-side'):String(x.type).includes('buy-side')));
  const entryConfirm=Boolean(direction&&(((m1?.structure?.breaks||[]).some(x=>String(x.type).includes(word)))||((m5?.structure?.breaks||[]).some(x=>String(x.type).includes(word)))));
  const scoreComponents=[
    {label:'Structure dominante M30 (BOS / CHoCH)',passed:Boolean(direction&&m30?.structure?.bias!=='neutre'),weight:25},
    {label:'Confirmation structurelle M15',passed:m15Aligned,weight:25},
    {label:'BOS / CHoCH M30',passed:m30Break,weight:15},
    {label:'BOS / CHoCH M15',passed:m15Break,weight:15},
    {label:'Contexte supérieur H4 cohérent',passed:h4Aligned&&h4Ema,weight:10},
    {label:'Liquidité / sweep M5',passed:m5Sweep,weight:5},
    {label:'Déclencheur précis M5 / M1',passed:entryConfirm,weight:5}
  ];
  const score=scoreComponents.reduce((sum,x)=>sum+(x.passed?x.weight:0),0);
  const aligned=Boolean(direction&&m30?.structure?.bias!=='neutre'&&m15Aligned);
  return {direction,score,scoreComponents,aligned,m30m15Aligned:aligned,h4Aligned};
}
