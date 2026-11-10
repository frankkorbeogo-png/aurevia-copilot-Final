const body=c=>Math.abs(c.close-c.open), range=c=>Math.max(1e-12,c.high-c.low), upper=c=>c.high-Math.max(c.open,c.close), lower=c=>Math.min(c.open,c.close)-c.low;
export function detectCandlestickPatterns(candles){
  if(!Array.isArray(candles)||candles.length<3)return [];
  const out=[],n=candles.length,a=candles[n-1],b=candles[n-2],c=candles[n-3];
  const valid=x=>x&&[x.open,x.high,x.low,x.close].every(Number.isFinite)&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close);
  if(![a,b,c].every(valid))return [];
  const ar=range(a),ab=body(a),br=range(b),bb=body(b),cr=range(c),cb=body(c);
  if(ab/ar<=.1)out.push({name:'Doji',type:'indecision',confirmation:'weak',reason:'Corps très réduit par rapport à la bougie.'});
  if(a.close>a.open&&b.close<b.open&&a.open<=b.close&&a.close>=b.open)out.push({name:'Englobante haussière',type:'reversal',confirmation:'needs-context',reason:'Le corps haussier englobe le corps précédent.'});
  if(a.close<a.open&&b.close>b.open&&a.open>=b.close&&a.close<=b.open)out.push({name:'Englobante baissière',type:'reversal',confirmation:'needs-context',reason:'Le corps baissier englobe le corps précédent.'});
  const prior=candles.slice(Math.max(0,n-6),n-1),priorUp=prior.length>=3&&prior.at(-1).close>prior[0].close,priorDown=prior.length>=3&&prior.at(-1).close<prior[0].close;
  if(lower(a)>=ab*2&&upper(a)<=ab*.6&&a.close>=a.open)out.push({name:priorUp?'Pendu potentiel':'Marteau potentiel',type:'reversal',confirmation:'needs-context',reason:'Longue mèche basse ; le contexte précédent distingue marteau et pendu.'});
  if(upper(a)>=ab*2&&lower(a)<=ab*.6&&a.close<=a.open)out.push({name:priorDown?'Marteau inversé potentiel':'Étoile filante potentielle',type:'reversal',confirmation:'needs-context',reason:'Longue mèche haute ; le contexte précédent distingue marteau inversé et étoile filante.'});
  const small=bb/br<.35&&cb/cr>.55;
  if(c.close<c.open&&small&&a.close>a.open&&a.close>(c.open+c.close)/2)out.push({name:'Étoile du matin potentielle',type:'reversal',confirmation:'needs-context',reason:'Séquence trois bougies ; vérifier le contexte et la clôture.'});
  if(c.close>c.open&&small&&a.close<a.open&&a.close<(c.open+c.close)/2)out.push({name:'Étoile du soir potentielle',type:'reversal',confirmation:'needs-context',reason:'Séquence trois bougies ; vérifier le contexte et la clôture.'});
  return out;
}

export function detectChartPatterns(candles,{lookback=2,tolerance=0.004}={}){
  if(!Array.isArray(candles)||candles.length<12)return [];
  const highs=[],lows=[];
  for(let i=lookback;i<candles.length-lookback;i++){
    const x=candles[i];if(!x||![x.high,x.low].every(Number.isFinite))continue;
    if(candles.slice(i-lookback,i+lookback+1).every((c,j)=>j===lookback||x.high>c.high))highs.push({i,p:x.high});
    if(candles.slice(i-lookback,i+lookback+1).every((c,j)=>j===lookback||x.low<c.low))lows.push({i,p:x.low});
  }
  const out=[],near=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-9)<=tolerance;
  if(highs.length>=3){const [a,b,c]=highs.slice(-3);if(b.p>a.p&&b.p>c.p&&near(a.p,c.p))out.push({name:'Tête et épaules potentielle',type:'reversal',confirmation:'needs-neckline-break',reason:'Trois sommets avec sommet central plus élevé et épaules proches.'});}
  if(highs.length>=2){const [a,b]=highs.slice(-2);const between=lows.filter(x=>x.i>a.i&&x.i<b.i).at(-1);if(near(a.p,b.p)&&between)out.push({name:'Double sommet potentiel',type:'reversal',confirmation:'needs-neckline-break',reason:'Deux sommets proches ; attendre la cassure de la ligne de cou.'});}
  if(lows.length>=2){const [a,b]=lows.slice(-2);const between=highs.filter(x=>x.i>a.i&&x.i<b.i).at(-1);if(near(a.p,b.p)&&between)out.push({name:'Double creux potentiel',type:'reversal',confirmation:'needs-neckline-break',reason:'Deux creux proches ; attendre la cassure de la ligne de cou.'});}
  if(highs.length>=3&&lows.length>=3){const hs=highs.slice(-3),ls=lows.slice(-3);const flatHigh=hs.every(x=>near(x.p,hs[0].p)),risingLow=ls[0].p<ls[1].p&&ls[1].p<ls[2].p;const flatLow=ls.every(x=>near(x.p,ls[0].p)),fallingHigh=hs[0].p>hs[1].p&&hs[1].p>hs[2].p;const fallingHighs=hs[0].p>hs[1].p&&hs[1].p>hs[2].p,risingHighs=hs[0].p<hs[1].p&&hs[1].p<hs[2].p,risingLows=ls[0].p<ls[1].p&&ls[1].p<ls[2].p,fallingLows=ls[0].p>ls[1].p&&ls[1].p>ls[2].p;if(flatHigh&&risingLow)out.push({name:'Triangle ascendant potentiel',type:'continuation-or-breakout',confirmation:'needs-breakout',reason:'Résistance horizontale et creux ascendants.'});if(flatLow&&fallingHigh)out.push({name:'Triangle descendant potentiel',type:'continuation-or-breakout',confirmation:'needs-breakout',reason:'Support horizontal et sommets descendants.'});if(fallingHighs&&risingLows)out.push({name:'Triangle symétrique potentiel',type:'continuation-or-breakout',confirmation:'needs-breakout',reason:'Sommets descendants et creux ascendants ; attendre une cassure confirmée.'});if(risingHighs&&risingLows)out.push({name:'Biseau ascendant potentiel',type:'reversal-or-continuation',confirmation:'needs-breakout',reason:'Sommets et creux ascendants ; attendre la rupture de la borne basse.'});if(fallingHighs&&fallingLows)out.push({name:'Biseau descendant potentiel',type:'reversal-or-continuation',confirmation:'needs-breakout',reason:'Sommets et creux descendants ; attendre la rupture de la borne haute.'});}
  return out;
}
