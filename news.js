function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function formatCalendarDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(date)+' UTC':String(value||'Horaire à confirmer');}
function renderCalendarTable(host,events){
 const table=el('table','economic-events-grid'),head=el('thead'),row=el('tr');
 for(const label of ['Date / heure','Devise','Événement','Impact','Précédent','Prévision','Réel'])row.append(el('th','',label));
 head.append(row);table.append(head);const body=el('tbody');
 for(const event of events){const tr=el('tr');[formatCalendarDate(event.date),event.currency,event.event,event.importance||'—',event.previous||'—',event.forecast||'—',event.actual||'—'].forEach((value,index)=>tr.append(el('td',index===2?'calendar-event-name':'',value)));body.append(tr);}
 table.append(body);host.replaceChildren(table);
}
export function initEconomicCalendar(container,getAccessToken=async()=>null){
 if(!container)return ()=>{};let disposed=false,fallbackTimer=null,loadingFallback=false;
 const section=el('section','aurevia-calendar-tv'),heading=el('div','calendar-tv-heading','Calendrier économique');
 const description=el('p','calendar-tv-description','Événements économiques et horaires en UTC. Source TradingView, avec repli sur le flux calendrier AUREVIA.');
 const status=el('p','calendar-tv-status','Chargement du calendrier TradingView…'),mount=el('div','aurevia-calendar-tv-mount'),actions=el('div','calendar-tv-actions');
 const sourceLink=el('a','small-btn','Ouvrir le calendrier TradingView');sourceLink.href='https://www.tradingview.com/economic-calendar/';sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';
 const retry=el('button','small-btn','Réessayer');retry.type='button';retry.hidden=true;actions.append(sourceLink,retry);section.append(heading,description,status,mount,actions);container.replaceChildren(section);
 const showFallback=async reason=>{
  if(disposed||loadingFallback)return;loadingFallback=true;if(fallbackTimer){clearTimeout(fallbackTimer);fallbackTimer=null;}
  status.textContent=reason+' · Chargement du calendrier de secours…';
  try{
   const token=await getAccessToken();if(disposed)return;if(!token)throw new Error('Session non disponible pour le calendrier de secours.');
   const response=await fetch('/api/economic-calendar',{headers:{authorization:'Bearer '+token},cache:'no-store'});const data=await response.json().catch(()=>({}));
   if(!response.ok||!Array.isArray(data.events))throw new Error(data.error||'Le flux de secours ne répond pas.');if(disposed)return;
   if(data.events.length){renderCalendarTable(mount,data.events);status.textContent=(data.source||'Calendrier AUREVIA')+' · '+data.events.length+' événement(s) · '+(data.asOf?'mis à jour '+formatCalendarDate(data.asOf):'horodatage non fourni')+'.';}
   else{mount.replaceChildren(el('p','muted','Aucun événement disponible sur la période demandée.'));status.textContent='Calendrier de secours joignable, mais aucun événement reçu.';}
   if(typeof data.attribution?.url==='string'&&/^https:\/\//i.test(data.attribution.url)){const attribution=el('a','calendar-tv-source-link','Source du flux de secours : '+(data.source||'calendrier AUREVIA'));attribution.href=data.attribution.url;attribution.target='_blank';attribution.rel='noopener noreferrer';actions.append(attribution);}
   retry.hidden=true;
  }catch(error){if(disposed)return;mount.replaceChildren(el('p','muted','Le calendrier intégré et le flux de secours sont indisponibles. Ouvrez la source TradingView avec le lien ci-dessus.'));status.textContent='Calendrier indisponible : '+String(error.message||error);retry.hidden=false;}
  finally{loadingFallback=false;}
 };
 const loadTradingView=()=>{
  if(disposed)return;retry.hidden=true;mount.replaceChildren();
  const widget=el('div','tradingview-widget-container');widget.style.width='100%';widget.style.height='min(760px, 78vh)';widget.style.minHeight='520px';widget.style.backgroundColor='#000000';
  const inner=el('div','tradingview-widget-container__widget');inner.style.width='100%';inner.style.height='100%';widget.append(inner);
  const script=document.createElement('script');script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';script.async=true;
  script.text=JSON.stringify({colorTheme:'dark',isTransparent:false,locale:'fr',importanceFilter:'-1,0,1',width:'100%',height:'100%'});
  script.onerror=()=>showFallback('Le widget TradingView n’a pas pu être chargé.');widget.append(script);mount.replaceChildren(widget);status.textContent='Connexion à TradingView…';
  fallbackTimer=setTimeout(()=>{if(disposed)return;if(!inner.querySelector('iframe'))showFallback('TradingView ne renvoie pas le calendrier.');},15000);
 };
 retry.addEventListener('click',loadTradingView);loadTradingView();
 return ()=>{disposed=true;if(fallbackTimer)clearTimeout(fallbackTimer);container.replaceChildren();};
}
