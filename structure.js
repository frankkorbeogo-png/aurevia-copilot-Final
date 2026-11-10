export function detectMarketStructure(candles,{swing=2}={}){
  if(!Array.isArray(candles)||candles.length<2*swing+3)return {bias:'indéterminé',swings:[],breaks:[],sweeps:[],fvg:[],orderBlocks:[],warning:'Historique insuffisant.'};
  const highs=[],lows=[];
  for(let i=swing;i<candles.length-swing;i++){
    const x=candles[i];if(!x||![x.high,x.low,x.close].every(Number.isFinite))continue;
    if(candles.slice(i-swing,i+swing+1).every((c,j)=>j===swing||x.high>c.high))highs.push({index:i,price:x.high,type:'high'});
    if(candles.slice(i-swing,i+swing+1).every((c,j)=>j===swing||x.low<c.low))lows.push({index:i,price:x.low,type:'low'});
  }
  const h1=highs.at(-2),h2=highs.at(-1),l1=lows.at(-2),l2=lows.at(-1);
  let bias='range';if(h1&&h2&&l1&&l2){if(h2.price>h1.price&&l2.price>l1.price)bias='haussier';else if(h2.price<h1.price&&l2.price<l1.price)bias='baissier';}
  const last=candles.at(-1),prev=candles.at(-2),breaks=[];
  if(h2&&last.close>h2.price)breaks.push({type:bias==='baissier'?'CHoCH haussier':'BOS haussier',level:h2.price,index:candles.length-1,confirmedByClose:true});
  if(l2&&last.close<l2.price)breaks.push({type:bias==='haussier'?'CHoCH baissier':'BOS baissier',level:l2.price,index:candles.length-1,confirmedByClose:true});
  const sweeps=[];if(h2&&last.high>h2.price&&last.close<h2.price)sweeps.push({type:'buy-side liquidity sweep',level:h2.price,reclaimed:true});if(l2&&last.low<l2.price&&last.close>l2.price)sweeps.push({type:'sell-side liquidity sweep',level:l2.price,reclaimed:true});
  const fvg=[];for(let i=2;i<candles.length;i++){const left=candles[i-2],right=candles[i];if(left.high<right.low)fvg.push({type:'bullish FVG',low:left.high,high:right.low,index:i,mitigated:candles.slice(i+1).some(c=>c.low<=right.low)});if(left.low>right.high)fvg.push({type:'bearish FVG',low:right.high,high:left.low,index:i,mitigated:candles.slice(i+1).some(c=>c.high>=right.high)});}
  const orderBlocks=[];for(const br of breaks){const bullish=br.type.includes('haussier');for(let i=candles.length-2;i>=Math.max(0,candles.length-22);i--){const c=candles[i],opposite=bullish?c.close<c.open:c.close>c.open;if(opposite){const later=candles.slice(i+1);orderBlocks.push({type:bullish?'bullish OB candidate':'bearish OB candidate',low:c.low,high:c.high,index:i,mitigated:later.some(x=>x.low<=c.high&&x.high>=c.low),confirmation:'candidate'});break;}}}
  return {bias,swings:[...highs,...lows].sort((a,b)=>a.index-b.index),breaks,sweeps,fvg,orderBlocks,warning:'Structure descriptive : swings confirmés après les bougies de droite ; les cassures sont confirmées par clôture. Les OB sont des candidats et exigent une validation contextuelle.'};
}
