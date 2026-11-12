/** Score de confirmation technique explicable — jamais une probabilité statistique.
 * M30 = structure principale, M15 = confrontation, M5 = unique déclencheur.
 */
export function evaluateConfluence({m30,m15,m5}) {
 const b30=m30?.structure?.bias,b15=m15?.structure?.bias;
 const direction=b30==='haussier'?'BUY':b30==='baissier'?'SELL':(b15==='haussier'?'BUY':b15==='baissier'?'SELL':null);
 const word=direction==='BUY'?'haussier':'baissier';
 const m30Break=Boolean(direction&&(m30?.structure?.breaks||[]).some(x=>String(x.type).includes(word)));
 const m15Aligned=Boolean(direction&&(b15===b30||b15===(direction==='BUY'?'haussier':'baissier')));
 const m15Break=Boolean(direction&&(m15?.structure?.breaks||[]).some(x=>String(x.type).includes(word)));
 const m5Sweep=Boolean(direction&&(m5?.structure?.sweeps||[]).some(x=>direction==='BUY'?String(x.type).includes('sell-side'):String(x.type).includes('buy-side')));
 const entryConfirm=Boolean(direction&&(m5?.structure?.breaks||[]).some(x=>String(x.type).includes(word)));
 const scoreComponents=[
  {label:'Structure dominante M30 (BOS / CHoCH)',passed:Boolean(direction&&m30?.structure?.bias!=='neutre'),weight:30},
  {label:'Confrontation structurelle M15',passed:m15Aligned,weight:30},
  {label:'BOS / CHoCH M30',passed:m30Break,weight:15},
  {label:'BOS / CHoCH M15',passed:m15Break,weight:15},
  {label:'Liquidité / sweep M5',passed:m5Sweep,weight:5},
  {label:'Déclencheur M5',passed:entryConfirm,weight:5}
 ];
 const score=scoreComponents.reduce((sum,x)=>sum+(x.passed?x.weight:0),0);
 const aligned=Boolean(direction&&m30?.structure?.bias!=='neutre'&&m15Aligned);
 return {direction,score,scoreComponents,aligned,m30m15Aligned:aligned};
}
