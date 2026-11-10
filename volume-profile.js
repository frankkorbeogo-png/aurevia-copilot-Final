/** Approximation du Volume Profile par bougies OHLCV, pas un profil tick par tick. */
export function calculateFixedRangeVolumeProfile(candles,{bins=24,valueArea=0.70}={}) {
  if(!Array.isArray(candles)||candles.length<10||!Number.isInteger(bins)||bins<8||bins>64||!Number.isFinite(valueArea)||valueArea<=0||valueArea>1) return null;
  const valid=candles.filter(c=>c&&[c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.high>=c.low&&c.volume>0);
  if(valid.length<10)return null;
  const min=Math.min(...valid.map(c=>c.low)),max=Math.max(...valid.map(c=>c.high));
  if(!(max>min))return null;
  const step=(max-min)/bins,levels=Array.from({length:bins},(_,i)=>({low:min+i*step,high:i===bins-1?max:min+(i+1)*step,volume:0}));
  for(const candle of valid){
    const first=Math.max(0,Math.min(bins-1,Math.floor((candle.low-min)/step)));
    const last=Math.max(0,Math.min(bins-1,Math.floor((candle.high-min)/step)));
    const touched=[];for(let i=first;i<=last;i++)if(levels[i].high>=candle.low&&levels[i].low<=candle.high)touched.push(i);
    const share=candle.volume/Math.max(1,touched.length);for(const i of touched)levels[i].volume+=share;
  }
  const total=levels.reduce((s,x)=>s+x.volume,0);if(!total)return null;
  const pocIndex=levels.reduce((best,x,i)=>x.volume>levels[best].volume?i:best,0);
  let left=pocIndex,right=pocIndex,acc=levels[pocIndex].volume;
  while(acc<total*valueArea&&(left>0||right<bins-1)){
    const lv=left>0?levels[left-1].volume:-1,rv=right<bins-1?levels[right+1].volume:-1;
    if(rv>lv){right++;acc+=levels[right].volume;}else{left--;acc+=levels[left].volume;}
  }
  return {rangeLow:min,rangeHigh:max,totalVolume:total,poc:(levels[pocIndex].low+levels[pocIndex].high)/2,val:levels[left].low,vah:levels[right].high,levels:levels.map(x=>({...x,percent:x.volume/total*100})),method:'OHLCV approximation'};
}
