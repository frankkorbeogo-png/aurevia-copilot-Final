function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}

/**
 * TradingView est l'unique source de tous les calendriers économiques affichés
 * dans AUREVIA. Aucun tableau/API économique secondaire n'est présenté à l'utilisateur.
 */
export function initEconomicCalendar(container){
 if(!container)return ()=>{};
 let disposed=false;
 const section=document.createElement('section');
 section.className='aurevia-calendar-tv';
 const heading=el('div','calendar-tv-heading','Calendrier économique TradingView');
 const description=el('p','calendar-tv-description','Calendrier économique mondial · source TradingView · affichage en français.');
 const mount=el('div','aurevia-calendar-tv-mount');
 section.append(heading,description,mount);
 const widget=document.createElement('div');
 widget.className='tradingview-widget-container';
 widget.style.width='100%';
 widget.style.height='min(760px, 78vh)';
 widget.style.minHeight='520px';
 widget.style.backgroundColor='#000000';
 const inner=document.createElement('div');
 inner.className='tradingview-widget-container__widget';
 inner.style.width='100%';inner.style.height='100%';
 widget.append(inner);
 const attribution=document.createElement('div');
 attribution.className='tradingview-widget-copyright';
 const link=document.createElement('a');
 link.href='https://www.tradingview.com/economic-calendar/';
 link.target='_blank';link.rel='noopener noreferrer';
 link.textContent='Ouvrir le calendrier économique TradingView';
 attribution.append(link);widget.append(attribution);
 const script=document.createElement('script');
 script.type='text/javascript';
 script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';
 script.async=true;
 script.text=JSON.stringify({colorTheme:'dark',isTransparent:false,locale:'fr',importanceFilter:'-1,0,1',width:'100%',height:'100%'});
 widget.append(script);mount.replaceChildren(widget);container.replaceChildren(section);
 return ()=>{if(disposed)return;disposed=true;container.replaceChildren();};
}
