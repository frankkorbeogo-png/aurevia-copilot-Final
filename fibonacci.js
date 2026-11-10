export function calculateFibonacciRetracements(swings,bias='indéterminé') {
  if(!Array.isArray(swings))return null;
  const highs=swings.filter(x=>x?.type==='high'&&Number.isFinite(x.price));
  const lows=swings.filter(x=>x?.type==='low'&&Number.isFinite(x.price));
  let high,low;
  if(bias==='haussier'){
    high=highs.at(-1);low=high?lows.filter(x=>x.index===undefined||high.index===undefined||x.index<high.index).at(-1):null;
  }else if(bias==='baissier'){
    low=lows.at(-1);high=low?highs.filter(x=>x.index===undefined||low.index===undefined||x.index<low.index).at(-1):null;
  }else{high=highs.at(-1);low=lows.at(-1);}
  if(!high||!low||high.price<=low.price)return null;
  const range=high.price-low.price;
  const levels=[0.382,0.5,0.618].map(ratio=>({ratio,price:bias==='baissier'?low.price+range*ratio:high.price-range*ratio}));
  return {low:low.price,high:high.price,bias,levels};
}
