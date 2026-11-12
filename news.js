const CALENDAR_URL='https://showmytrades.com/api/public/calendar/v1?currency=USD&impact=high%2Cmedium&days=7&format=json';
const REFRESH_MS=15*60*1000;
let cachedPayload=null;
let lastFetchAt=0;
let pendingFetch=null;
let refreshTimer=null;

function el(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=String(text);
  return node;
}
function formatEventTime(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return 'Hora non disponible';
  return new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Ouagadougou',weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function renderCalendar(container,payload){
  const events=Array.isArray(payload?.events)?payload.events:[];
  const fragment=document.createDocumentFragment();
  const header=el('div','calendar-source-line');
  header.append(el('span','calendar-source-label','Calendrier économique USD · UTC→heure Burkina Faso'));
  header.append(el('span','calendar-refresh-time',`Actualisé : ${formatEventTime(payload.generated_at||payload.server_time_iso)}`));
  fragment.append(header);
  if(!events.length){
    fragment.append(el('p','calendar-empty','Aucun événement USD important ou moyen n’est actuellement fourni pour cette période. Vérifiez à nouveau plus tard.'));
  }else{
    const list=el('div','calendar-events');
    for(const event of events){
      const item=el('article','calendar-event');
      const top=el('div','calendar-event-top');
      const impact=String(event.impact||'').toLowerCase();
      top.append(el('span',`calendar-impact impact-${impact}`,impact==='high'?'Impact élevé':impact==='medium'?'Impact moyen':'Impact non précisé'));
      top.append(el('time','calendar-event-time',formatEventTime(event.time)));
      item.append(top);
      item.append(el('h3','calendar-event-title',event.title||'Événement économique'));
      const values=el('div','calendar-event-values');
      for(const [label,value] of [['Précédent',event.previous],['Prévision',event.forecast],['Réel',event.actual]]){
        const cell=el('div','calendar-value');cell.append(el('small','',label),el('b','',value||'—'));values.append(cell);
      }
      item.append(values);
      if(event.status==='moved')item.append(el('p','calendar-event-note',`Horaire modifié${event.moved_from?` · ancien horaire : ${formatEventTime(event.moved_from)}`:''}.`));
      else if(event.status==='tentative'||event.confidence==='sources_disagree')item.append(el('p','calendar-event-note','Horaire provisoire : les sources ne concordent pas.'));
      list.append(item);
    }
    fragment.append(list);
  }
  const attribution=payload?.attribution;
  const credit=el('p','calendar-attribution','Source : ShowMyTrades · calendrier indicatif, susceptible de changements.');
  if(attribution?.url){const link=el('a','','Consulter la source');link.href=attribution.url;link.target='_blank';link.rel='noopener noreferrer';credit.append(' ',link);}
  fragment.append(credit);
  container.replaceChildren(fragment);
}
function renderError(container){
  const wrap=el('div','calendar-error');
  wrap.append(el('b','','Calendrier temporairement indisponible'),el('p','','La source économique ne répond pas. AUREVIA ne remplacera pas les événements manquants par des données estimées. Réessayez dans quelques minutes.'));
  container.replaceChildren(wrap);
}
async function loadCalendar(force=false){
  if(!force&&cachedPayload&&Date.now()-lastFetchAt<REFRESH_MS)return cachedPayload;
  if(pendingFetch)return pendingFetch;
  pendingFetch=(async()=>{
    const response=await fetch(CALENDAR_URL,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`Calendrier HTTP ${response.status}`);
    const payload=await response.json();
    if(!payload||!Array.isArray(payload.events))throw new Error('Format de calendrier invalide');
    cachedPayload=payload;lastFetchAt=Date.now();return payload;
  })();
  try{return await pendingFetch;}finally{pendingFetch=null;}
}
export function initEconomicCalendar(container){
  if(!container)return;
  container.replaceChildren(el('p','calendar-loading','Chargement des événements économiques USD…'));
  loadCalendar().then(payload=>renderCalendar(container,payload)).catch(()=>renderError(container));
  if(!refreshTimer){
    refreshTimer=setInterval(()=>{
      loadCalendar(true).then(payload=>document.querySelectorAll('#calendarWidget,#calendarStandalone').forEach(node=>renderCalendar(node,payload))).catch(()=>document.querySelectorAll('#calendarWidget,#calendarStandalone').forEach(renderError));
    },REFRESH_MS);
  }
}
