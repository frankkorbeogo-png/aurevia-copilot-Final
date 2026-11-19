function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}

export function initEconomicCalendar(container,getAccessToken){
 if(!container)return ()=>{};
 let disposed=false,timer=null,observer=null,requestController=null,loadId=0;
 const section=el('section','aurevia-calendar-tv'),heading=el('div','calendar-tv-heading','Calendrier économique');
 const description=el('p','calendar-tv-description','TradingView en source principale ; calendrier officiel FRED et Réserve fédérale en secours si le widget ne répond pas.');
 const status=el('p','calendar-tv-status','Chargement du calendrier TradingView…'),mount=el('div','aurevia-calendar-tv-mount'),actions=el('div','calendar-tv-actions');
 const sourceLink=el('a','small-btn','Ouvrir le calendrier TradingView');sourceLink.href='https://www.tradingview.com/economic-calendar/';sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';
 const retry=el('button','small-btn','Réessayer TradingView');retry.type='button';retry.hidden=true;
 const refresh=el('button','small-btn','Actualiser les événements');refresh.type='button';
 actions.append(sourceLink,retry,refresh);section.append(heading,description,status,mount,actions);container.replaceChildren(section);

 const renderFallback=async current=>{
  if(disposed||current!==loadId)return;
  if(timer)clearTimeout(timer);if(observer)observer.disconnect();if(requestController)requestController.abort();
  status.textContent='TradingView ne répond pas. Chargement du calendrier de secours…';
  mount.replaceChildren(el('p','muted','Récupération des prochaines publications économiques officielles…'));
  try{
   const token=typeof getAccessToken==='function'?await getAccessToken():null;
   if(!token)throw new Error('Reconnectez-vous pour consulter le calendrier de secours.');
   requestController=new AbortController();
   const response=await fetch('/api/economic-calendar',{headers:{authorization:'Bearer '+token,accept:'application/json'},cache:'no-store',signal:requestController.signal});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||'Calendrier de secours indisponible.');
   if(disposed||current!==loadId)return;
   const events=Array.isArray(data.events)?data.events:[];
   const list=el('div','economic-calendar-fallback-list');
   if(!events.length)list.append(el('p','muted','Aucune publication officielle à venir dans les 30 prochains jours.'));
   for(const event of events){
    const card=el('article','economic-calendar-event');
    const date=new Date(event.scheduledAt);
    const local=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Ouagadougou',dateStyle:'medium',timeStyle:'short'}).format(date):'Horaire indisponible';
    card.append(el('strong','economic-calendar-event-name',event.name),el('span','economic-calendar-event-meta',event.currency+' · Impact '+event.impact+' · '+local+' (Burkina Faso)'),el('small','economic-calendar-event-source',event.source+' · '+event.timeBasis));
    if(event.sourceUrl){const link=el('a','small-btn','Source officielle');link.href=event.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}
    list.append(card);
   }
   mount.replaceChildren(list);
   status.textContent='Calendrier de secours actif · '+events.length+' événement(s) · mise à jour '+new Date(data.asOf||Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  }catch(error){
   if(disposed||current!==loadId||error.name==='AbortError')return;
   status.textContent=error.message||'Le calendrier est temporairement indisponible.';
   mount.replaceChildren(el('p','muted','Le widget TradingView et la source de secours sont momentanément indisponibles. Réessayez dans quelques instants.'));
  }
 };
 const load=()=>{
  if(disposed)return;const current=++loadId;
  retry.hidden=true;if(timer)clearTimeout(timer);if(observer)observer.disconnect();if(requestController)requestController.abort();
  mount.replaceChildren();
  const widget=el('div','tradingview-widget-container');widget.style.width='100%';widget.style.height='min(760px, 78vh)';widget.style.minHeight='520px';widget.style.backgroundColor='#000000';
  const inner=el('div','tradingview-widget-container__widget');inner.style.width='100%';inner.style.height='100%';widget.append(inner);
  const script=document.createElement('script');script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';script.async=true;
  script.text=JSON.stringify({colorTheme:'dark',isTransparent:false,locale:'fr',importanceFilter:'-1,0,1',width:'100%',height:'100%'});
  const unavailable=()=>{if(disposed||current!==loadId)return;retry.hidden=false;renderFallback(current);};
  script.onerror=unavailable;widget.append(script);mount.replaceChildren(widget);status.textContent='Connexion à TradingView…';
  observer=new MutationObserver(()=>{if(inner.querySelector('iframe')){if(timer)clearTimeout(timer);status.textContent='Calendrier TradingView chargé.';}});
  observer.observe(mount,{childList:true,subtree:true});
  timer=setTimeout(()=>{if(!inner.querySelector('iframe'))unavailable();},12000);
 };
 retry.addEventListener('click',load);refresh.addEventListener('click',()=>renderFallback(loadId));load();
 return ()=>{disposed=true;loadId++;if(timer)clearTimeout(timer);if(observer)observer.disconnect();if(requestController)requestController.abort();container.replaceChildren();};
}
