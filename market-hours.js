const FX=new Set(['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','EURAUD','EURCHF','GBPAUD','AUDJPY']);
const METALS=new Set(['XAUUSD','XAGUSD']);
const CRYPTO=new Set(['BTCUSD','ETHUSD','SOLUSD','XRPUSD']);
const EQUITIES=new Set(['AAPL','MSFT','NVDA','TSLA','AMZN']);
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
function holidayClosure(_now){
  // Generic US holiday dates are informational only. They are not proof that
  // an OTC Forex or broker XAU/USD feed is closed.
  return null;
}
function addDaysFromParts(p,n){return addDay(new Date(Date.UTC(+p.year,+p.month-1,+p.day)),n);}
function fmtBF(date,withDate=false){return new Intl.DateTimeFormat('fr-FR',{timeZone:BF,...(withDate?{weekday:'long',day:'2-digit',month:'long'}:{}),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);}

function nthWeekday(year,month,weekday,n){
  const first=new Date(Date.UTC(year,month-1,1)).getUTCDay();
  return 1+((weekday-first+7)%7)+(n-1)*7;
}
function lastWeekday(year,month,weekday){
  const last=new Date(Date.UTC(year,month,0)),back=(last.getUTCDay()-weekday+7)%7;
  return last.getUTCDate()-back;
}
function observedDate(year,month,day){
  const d=new Date(Date.UTC(year,month-1,day)),w=d.getUTCDay();
  if(w===6)d.setUTCDate(d.getUTCDate()-1);else if(w===0)d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}
function usEquityHolidays(year){
  const dates=new Map();
  const add=(date,label)=>dates.set(date.toISOString().slice(0,10),label);
  const addObserved=(m,d,label)=>dates.set(observedDate(year,m,d),label);
  addObserved(1,1,'Nouvel An');
  add(new Date(Date.UTC(year,0,nthWeekday(year,1,1,3))),'Martin Luther King Jr. Day');
  add(new Date(Date.UTC(year,1,nthWeekday(year,2,1,3))),'Presidents Day');
  const gf=addDay(easter(year),-2);add(gf,'Vendredi saint');
  add(new Date(Date.UTC(year,4,lastWeekday(year,5,1))),'Memorial Day');
  addObserved(6,19,'Juneteenth');
  addObserved(7,4,'Independence Day');
  add(new Date(Date.UTC(year,8,nthWeekday(year,9,1,1))),'Labor Day');
  add(new Date(Date.UTC(year,10,nthWeekday(year,11,4,4))),'Thanksgiving');
  addObserved(12,25,'Noël');
  return dates;
}
function equityEarlyClose(year,month,day){
  const date=new Date(Date.UTC(year,month-1,day)),weekday=date.getUTCDay();
  if(weekday===0||weekday===6)return null;
  if(month===11&&day===nthWeekday(year,11,4,4)+1)return 'lendemain de Thanksgiving';
  if(month===12&&day===24)return 'veille de Noël';
  const observedJuly4=new Date(observedDate(year,7,4)+'T00:00:00Z');
  let previous=addDay(observedJuly4,-1);
  while(previous.getUTCDay()===0||previous.getUTCDay()===6||usEquityHolidays(year).has(previous.toISOString().slice(0,10)))previous=addDay(previous,-1);
  if(previous.toISOString().slice(0,10)===date.toISOString().slice(0,10))return 'veille de l’Indépendance';
  return null;
}
function equityClosure(now){
  const p=parts(now,'America/New_York'),day=({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6})[p.weekday];
  const date=p.year+'-'+p.month+'-'+p.day,holiday=usEquityHolidays(+p.year).get(date);
  const earlyClose=!holiday?equityEarlyClose(+p.year,+p.month,+p.day):null;
  const closeMinute=earlyClose?13*60:16*60;
  const mins=+p.hour*60 + +p.minute,closed=holiday||day===0||day===6||mins<570||mins>=closeMinute;
  if(!closed)return null;
  let next=new Date(Date.UTC(+p.year,+p.month-1,+p.day));
  for(let i=0;i<10;i++){
    next.setUTCDate(next.getUTCDate()+1);
    const wd=next.getUTCDay(),key=next.toISOString().slice(0,10);
    if(wd!==0&&wd!==6&&!usEquityHolidays(next.getUTCFullYear()).has(key))break;
  }
  const reopen=mins<570&&!holiday&&day!==0&&day!==6
    ? instant(+p.year,+p.month,+p.day,9,30)
    : instant(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate(),9,30);
  const label=holiday||(day===0||day===6?'week-end':mins<570?'avant ouverture de Wall Street':earlyClose?'après clôture anticipée ('+earlyClose+')':'après clôture de Wall Street');
  return {label,type:holiday?'HOLIDAY':earlyClose&&mins>=closeMinute?'EARLY_CLOSE':'SESSION',reopen};
}
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
  if(EQUITIES.has(code)){
    const session=equityClosure(now),closed=!!session,reopen=session?.reopen||null,label=session?.label||null;
    return {tradable:!closed,status:closed?'CLOSED':'OPEN',market:'EQUITY',timezone:'America/New_York',schedule:'NYSE/Nasdaq : lundi–vendredi, 09:30–16:00 (heure de New York), avec clôtures anticipées à 13:00 certains jours fériés',closureType:session?.type||null,closureLabel:label,reopensAt:reopen?.toISOString()||null,reason:closed?`Marché actions fermé : ${label}. ${reopen?`Réouverture prévue le ${fmtBF(reopen,true)} à ${fmtBF(reopen)} (heure du Burkina Faso).`:''} Les nouvelles analyses sont suspendues jusqu’à la réouverture.`:null,checkedAt:now.toISOString()};
  }
  const market=FX.has(code)?'FOREX':METALS.has(code)?'METALS':'UNKNOWN';
  if(market==='UNKNOWN')return {tradable:true,status:'UNRESTRICTED',market,checkedAt:now.toISOString()};
  const holiday=holidayClosure(now),session=sessionClosure(now,market),closed=!!session,reopen=session?.reopen||null,label=session?.label||null;
  return {tradable:!closed,status:closed?'CLOSED':'OPEN',market,timezone:BF,schedule:weeklySchedule(now,market),closureType:session?.type||null,closureLabel:label,reopensAt:reopen?.toISOString()||null,reason:closed?`Marché fermé : ${label}. ${reopen?`Réouverture prévue le ${fmtBF(reopen,true)} à ${fmtBF(reopen)} (heure du Burkina Faso).` : ''} Aucune nouvelle analyse ne peut être lancée pendant cette fermeture.`:null,checkedAt:now.toISOString()};
}
