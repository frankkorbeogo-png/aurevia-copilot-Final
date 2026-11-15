const FX=new Set(['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','EURAUD','EURCHF','GBPAUD','AUDJPY']);
const METALS=new Set(['XAUUSD','XAGUSD']);
const CRYPTO=new Set(['BTCUSD','ETHUSD','SOLUSD','XRPUSD']);
const NY='America/New_York', BF='Africa/Ouagadougou';
const FOREX_SESSION={openSunday:17,closeFriday:17};
const METALS_SESSION={openSunday:18,closeFriday:17,dailyBreakStart:17,dailyBreakEnd:18};
// Ajouter ici uniquement les fermetures exceptionnelles officiellement confirmées.
const EXCEPTIONAL_CLOSURES=[];

function parts(date,zone=NY){
  return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
}
function instant(y,m,d,h,min){
  const target=Date.UTC(y,m-1,d,h,min);let guess=target;
  for(let i=0;i<4;i++){const p=parts(new Date(guess));guess+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);}
  return new Date(guess);
}
function addDay(d,n){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));x.setUTCDate(x.getUTCDate()+n);return x;}
function easter(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return new Date(Date.UTC(y,mo-1,day));
}
function observed(y,m,d){const x=new Date(Date.UTC(y,m-1,d)),w=x.getUTCDay();return w===6?addDay(x,-1):w===0?addDay(x,1):x;}
function holidayWindows(y){
  const out=[];
  for(const h of [{date:observed(y,1,1),label:'Nouvel An'},{date:observed(y,12,25),label:'Noël'}]){
    const before=addDay(h.date,-1),after=addDay(h.date,1);
    out.push({start:instant(before.getUTCFullYear(),before.getUTCMonth()+1,before.getUTCDate(),17,0),end:instant(after.getUTCFullYear(),after.getUTCMonth()+1,after.getUTCDate(),17,0),label:h.label});
  }
  const gf=addDay(easter(y),-2),before=addDay(gf,-1),sun=addDay(gf,2);
  out.push({start:instant(before.getUTCFullYear(),before.getUTCMonth()+1,before.getUTCDate(),17,0),end:instant(sun.getUTCFullYear(),sun.getUTCMonth()+1,sun.getUTCDate(),17,0),label:'Vendredi saint'});
  for(const x of EXCEPTIONAL_CLOSURES){const start=new Date(x.start),end=new Date(x.end);if(Number.isFinite(+start)&&Number.isFinite(+end)&&end>start)out.push({start,end,label:x.label||'Fermeture exceptionnelle'});}
  return out;
}
function holidayClosure(now){
  const y=+parts(now).year;
  return [...holidayWindows(y-1),...holidayWindows(y),...holidayWindows(y+1)].find(x=>now>=x.start&&now<x.end)||null;
}
function addDaysFromParts(p,n){return addDay(new Date(Date.UTC(+p.year,+p.month-1,+p.day)),n);}
function fmtBF(date,withDate=false){return new Intl.DateTimeFormat('fr-FR',{timeZone:BF,...(withDate?{weekday:'long',day:'2-digit',month:'long'}:{}),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);}
function weeklySchedule(now,market){
  const rules=market==='METALS'?METALS_SESSION:FOREX_SESSION;
  const p=parts(now),dow=({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6})[p.weekday];
  const daysToSunday=(7-dow)%7,base=addDaysFromParts(p,daysToSunday);
  const sunday=instant(base.getUTCFullYear(),base.getUTCMonth()+1,base.getUTCDate(),rules.openSunday,0);
  const fridayDay=addDay(base,5),friday=instant(fridayDay.getUTCFullYear(),fridayDay.getUTCMonth()+1,fridayDay.getUTCDate(),rules.closeFriday,0);
  let schedule=`Ouverture dimanche ${fmtBF(sunday)} – fermeture vendredi ${fmtBF(friday)} (heure du Burkina Faso)`;
  if(market==='METALS'){
    const monday=addDay(base,1);
    const pauseStart=instant(monday.getUTCFullYear(),monday.getUTCMonth()+1,monday.getUTCDate(),rules.dailyBreakStart,0);
    const pauseEnd=instant(monday.getUTCFullYear(),monday.getUTCMonth()+1,monday.getUTCDate(),rules.dailyBreakEnd,0);
    schedule+=`; pause quotidienne ${fmtBF(pauseStart)}–${fmtBF(pauseEnd)}`;
  }
  return schedule;
}
function sessionClosure(now,market){
  const rules=market==='METALS'?METALS_SESSION:FOREX_SESSION;
  const p=parts(now),mins=+p.hour*60 + +p.minute,dow=p.weekday;
  if(market==='METALS'&&['Mon','Tue','Wed','Thu'].includes(dow)&&mins>=rules.dailyBreakStart*60&&mins<rules.dailyBreakEnd*60){
    const reopen=instant(+p.year,+p.month,+p.day,rules.dailyBreakEnd,0);
    return {label:'pause quotidienne des métaux',type:'DAILY_BREAK',reopen};
  }
  const openMin=rules.openSunday*60,closeMin=rules.closeFriday*60;
  if(dow==='Fri'&&mins>=closeMin||dow==='Sat'||dow==='Sun'&&mins<openMin){
    const daysToSunday=dow==='Fri'?2:dow==='Sat'?1:0;
    const day=addDaysFromParts(p,daysToSunday);
    const reopen=instant(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate(),rules.openSunday,0);
    return {label:'week-end',type:'WEEKEND',reopen};
  }
  return null;
}
export function getMarketStatus(symbol,now=new Date()){
  const code=String(symbol||'').toUpperCase().replace(/[^A-Z]/g,'');
  if(CRYPTO.has(code))return {tradable:true,status:'OPEN',market:'CRYPTO',checkedAt:now.toISOString()};
  const market=FX.has(code)?'FOREX':METALS.has(code)?'METALS':'UNKNOWN';
  if(market==='UNKNOWN')return {tradable:true,status:'UNRESTRICTED',market,checkedAt:now.toISOString()};
  const holiday=holidayClosure(now),session=sessionClosure(now,market),closed=!!(holiday||session),reopen=holiday?.end||session?.reopen||null,label=holiday?.label||session?.label||null;
  return {tradable:!closed,status:closed?'CLOSED':'OPEN',market,timezone:BF,schedule:weeklySchedule(now,market),closureType:holiday?'HOLIDAY':session?.type||null,closureLabel:label,reopensAt:reopen?.toISOString()||null,reason:closed?`Marché fermé : ${label}. ${reopen?`Réouverture prévue le ${fmtBF(reopen,true)} à ${fmtBF(reopen)} (heure du Burkina Faso).` : ''} Aucune nouvelle analyse ne peut être lancée pendant cette fermeture.`:null,checkedAt:now.toISOString()};
}
