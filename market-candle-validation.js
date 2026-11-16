export function parseMarketTimestamp(value,timezone){
 const raw=String(value||'').trim();if(!raw)return NaN;
 if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)){const parsed=Date.parse(raw);return Number.isFinite(parsed)?parsed:NaN;}
 const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
 if(!m||!timezone)return NaN;
 const [y,mo,d,h,mi,se]=[m[1],m[2],m[3],m[4],m[5],m[6]||'0'].map(Number);
 const target=Date.UTC(y,mo-1,d,h,mi,se);
 if(['UTC','Etc/UTC','GMT'].includes(timezone))return target;
 let guess=target;
 try{
  for(let i=0;i<4;i++){
   const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
   const represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
   guess+=target-represented;
  }
  return guess;
 }catch{return NaN;}
}
export function selectClosedMarketCandles(candles,timezone,intervalMinutes,now=Date.now()){
 if(!Array.isArray(candles)||!Number.isFinite(intervalMinutes)||intervalMinutes<=0)return {ok:false,candles:[],reason:'Paramètres de bougies invalides.'};
 const result=[];let previous=-Infinity;
 for(const candle of candles){
  const stamp=parseMarketTimestamp(candle?.time,timezone);
  if(!Number.isFinite(stamp)||stamp<=previous)return {ok:false,candles:[],reason:'Horodatages OHLC invalides, dupliqués ou désordonnés.'};
  previous=stamp;
  const closeAt=stamp+intervalMinutes*60000;
  if(closeAt<=now)result.push(candle);
 }
 if(result.length<30)return {ok:false,candles:result,reason:'Moins de 30 bougies clôturées disponibles.'};
 return {ok:true,candles:result,excludedUnclosed:candles.length-result.length};
}
export function validateLatestClosedCandle(candles,timezone,intervalMinutes,{now=Date.now(),maxAgeIntervals=2.5}={}){
 if(!Array.isArray(candles)||!candles.length)return {ok:false,error:'Historique OHLC absent.'};
 const stamp=parseMarketTimestamp(candles.at(-1)?.time,timezone);
 if(!Number.isFinite(stamp))return {ok:false,error:'Horodatage de la dernière bougie non vérifiable.'};
 const closeAt=stamp+intervalMinutes*60000,age=now-closeAt;
 if(age<0)return {ok:false,error:'La dernière bougie M15 est encore en formation.'};
 if(age>intervalMinutes*60000*maxAgeIntervals)return {ok:false,error:'La dernière bougie clôturée est trop ancienne.'};
 return {ok:true,closedAt:closeAt,ageMs:age};
}
