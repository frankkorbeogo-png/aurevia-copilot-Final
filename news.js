function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
export function initEconomicCalendar(container){
 if(!container)return ()=>{};
 let disposed=false,timer=null,observer=null;
 const section=el('section','aurevia-calendar-tv'),heading=el('div','calendar-tv-heading','Calendrier économique');
 const description=el('p','calendar-tv-description','Calendrier économique fourni exclusivement par TradingView. Horaires affichés selon les paramètres du widget.');
 const status=el('p','calendar-tv-status','Chargement du calendrier TradingView…'),mount=el('div','aurevia-calendar-tv-mount'),actions=el('div','calendar-tv-actions');
 const sourceLink=el('a','small-btn','Ouvrir le calendrier TradingView');sourceLink.href='https://www.tradingview.com/economic-calendar/';sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';
 const retry=el('button','small-btn','Réessayer');retry.type='button';retry.hidden=true;actions.append(sourceLink,retry);section.append(heading,description,status,mount,actions);container.replaceChildren(section);
 const load=()=>{
  if(disposed)return;retry.hidden=true;if(timer)clearTimeout(timer);if(observer)observer.disconnect();mount.replaceChildren();
  const widget=el('div','tradingview-widget-container');widget.style.width='100%';widget.style.height='min(760px, 78vh)';widget.style.minHeight='520px';widget.style.backgroundColor='#000000';
  const inner=el('div','tradingview-widget-container__widget');inner.style.width='100%';inner.style.height='100%';widget.append(inner);
  const script=document.createElement('script');script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';script.async=true;
  script.text=JSON.stringify({colorTheme:'dark',isTransparent:false,locale:'fr',importanceFilter:'-1,0,1',width:'100%',height:'100%'});
  const unavailable=()=>{if(disposed)return;status.textContent='Le calendrier TradingView est indisponible. Aucune source alternative ne sera utilisée.';mount.replaceChildren(el('p','muted','Impossible de charger le calendrier TradingView pour le moment.'));retry.hidden=false;};
  script.onerror=unavailable;widget.append(script);mount.replaceChildren(widget);status.textContent='Connexion à TradingView…';
  observer=new MutationObserver(()=>{if(inner.querySelector('iframe')){if(timer)clearTimeout(timer);status.textContent='Calendrier TradingView chargé.';}});
  observer.observe(mount,{childList:true,subtree:true});
  timer=setTimeout(()=>{if(!inner.querySelector('iframe'))unavailable();},15000);
 };
 retry.addEventListener('click',load);load();
 return ()=>{disposed=true;if(timer)clearTimeout(timer);if(observer)observer.disconnect();container.replaceChildren();};
}
