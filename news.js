export function initEconomicCalendar(container){
  if(!container)return;
  const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';script.async=true;
  script.text=JSON.stringify({colorTheme:'dark',isTransparent:true,width:'100%',height:'100%',locale:'fr',importanceFilter:'-1,0,1',countryFilter:'us,eu,gb,jp,au,ca,ch,nz'});
  script.onerror=()=>{container.innerHTML='<div class="chart-placeholder"><b>Calendrier externe indisponible</b><small>Le fournisseur économique ne répond pas. Consultez votre calendrier économique habituel avant toute décision.</small></div>';};
  const wrapper=document.createElement('div');wrapper.className='tradingview-widget-container';wrapper.style.height='100%';
  const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.height='100%';wrapper.append(widget,script);container.replaceChildren(wrapper);
}
