function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function formatEventTime(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—';return new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Ouagadougou',weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);}
function impactLabel(value){const v=String(value||'').toLowerCase();return v==='high'?'Élevé':v==='medium'?'Moyen':v==='low'?'Faible':'—';}
function renderCalendar(container,payload){
 const events=Array.isArray(payload?.events)?payload.events:[];const fragment=document.createDocumentFragment();
 const header=el('div','calendar-source-line');header.append(el('span','calendar-source-label','Calendrier économique · heure du Burkina Faso (UTC)'));header.append(el('span','calendar-refresh-time',`Actualisé : ${formatEventTime(payload.asOf||payload.generated_at)}`));fragment.append(header);
 const filters=el('div','calendar-filters');
 const currency=el('select','calendar-filter');currency.setAttribute('aria-label','Filtrer par devise');[['all','Toutes les devises'],...Array.from(new Set(events.map(e=>String(e.currency||'').toUpperCase()).filter(Boolean))).sort().map(v=>[v,v])].forEach(([v,l])=>{const o=el('option','',l);o.value=v;currency.append(o);});
 const impact=el('select','calendar-filter');impact.setAttribute('aria-label','Filtrer par impact');[['all','Tous les impacts'],['high','Impact élevé'],['medium','Impact moyen'],['low','Impact faible']].forEach(([v,l])=>{const o=el('option','',l);o.value=v;impact.append(o);});
 const period=el('select','calendar-filter');period.setAttribute('aria-label','Filtrer par période');[['all','14 jours'],['today','Aujourd’hui'],['tomorrow','Demain'],['week','7 jours']].forEach(([v,l])=>{const o=el('option','',l);o.value=v;period.append(o);});
 filters.append(currency,impact,period);fragment.append(filters);
 const summary=el('p','calendar-count','');fragment.append(summary);
 const tableWrap=el('div','calendar-table-wrap');const table=el('table','calendar-table');const thead=el('thead');const hr=el('tr');['Date / heure','Devise','Impact','Événement','Précédent','Prévision','Réel'].forEach(t=>hr.append(el('th','',t)));thead.append(hr);table.append(thead);const tbody=el('tbody');table.append(tbody);tableWrap.append(table);fragment.append(tableWrap);
 const attribution=el('p','calendar-attribution',payload?.notice||'Calendrier indicatif susceptible de changements.');const url=payload?.attribution?.url||'https://showmytrades.com/tools/economic-calendar';const link=el('a','','Consulter la source');link.href=url;link.target='_blank';link.rel='noopener noreferrer';attribution.append(' ',link);fragment.append(attribution);
 const apply=()=>{const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),tomorrow=new Date(start);tomorrow.setDate(tomorrow.getDate()+1);const endWeek=new Date(start);endWeek.setDate(endWeek.getDate()+7);const filtered=events.filter(e=>{const d=new Date(e.date);if(!Number.isFinite(d.getTime()))return false;const c=String(e.currency||'').toUpperCase(),im=String(e.importance||'').toLowerCase();if(currency.value!=='all'&&c!==currency.value)return false;if(impact.value!=='all'&&im!==impact.value)return false;if(period.value==='today'&&(d<start||d>=tomorrow))return false;if(period.value==='tomorrow'&&(d<tomorrow||d>=new Date(tomorrow.getTime()+86400000)))return false;if(period.value==='week'&&(d<start||d>=endWeek))return false;return true;});
  tbody.replaceChildren();summary.textContent=`${filtered.length} événement(s) affiché(s) sur ${events.length}`;
  if(!filtered.length){const tr=el('tr');const td=el('td','calendar-no-events','Aucun événement ne correspond aux filtres sélectionnés.');td.colSpan=7;tr.append(td);tbody.append(tr);return;}
  filtered.forEach(e=>{const tr=el('tr',`calendar-row impact-row-${String(e.importance||'').toLowerCase()}`);[formatEventTime(e.date),String(e.currency||'—').toUpperCase(),impactLabel(e.importance),e.event||'Événement économique',e.previous||'—',e.forecast||'—',e.actual||'—'].forEach((v,i)=>tr.append(el(i===3?'th':'td',i===3?'calendar-event-name':'',v)));tbody.append(tr);});
 };
 [currency,impact,period].forEach(x=>x.addEventListener('change',apply));apply();container.replaceChildren(fragment);
}
function renderError(container,message,retry){const wrap=el('div','calendar-error');wrap.append(el('b','','Calendrier temporairement indisponible'),el('p','',message||'La source économique ne répond pas. Aucune donnée ne sera inventée.'));const button=el('button','small-btn','Réessayer');button.type='button';button.addEventListener('click',retry);wrap.append(button);container.replaceChildren(wrap);}

/**
 * Calendrier structuré indépendant du contexte macro utilisé par le moteur IA.
 * TradingView reste un complément visuel et n'est jamais la source de l'analyse.
 */
function renderTradingView(container){
 const widget=document.createElement('div');widget.className='tradingview-widget-container';widget.style.width='100%';widget.style.height='420px';widget.style.backgroundColor='#000000';
 const inner=document.createElement('div');inner.className='tradingview-widget-container__widget';inner.style.width='100%';inner.style.height='100%';widget.append(inner);
 const attribution=document.createElement('div');attribution.className='tradingview-widget-copyright';const link=document.createElement('a');link.href='https://www.tradingview.com/economic-calendar/';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Calendrier économique TradingView';attribution.append(link);widget.append(attribution);
 const script=document.createElement('script');script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';script.async=true;script.text=JSON.stringify({colorTheme:'dark',isTransparent:true,locale:'fr',countryFilter:'us',importanceFilter:'-1,0,1',width:'100%',height:'100%'});widget.append(script);container.replaceChildren(widget);
}
export function initEconomicCalendar(container,getToken){
 if(!container)return;
 let disposed=false;
 const root=document.createElement('div');root.className='aurevia-calendar-root';
 const structured=document.createElement('div');structured.className='aurevia-calendar-structured';
 const tvSection=document.createElement('section');tvSection.className='aurevia-calendar-tv';
 const tvHeading=el('div','calendar-tv-heading','Calendrier économique TradingView');
 const tvDescription=el('p','calendar-tv-description','Vue interactive complémentaire · fond noir · indépendante des données utilisées par le moteur d’analyse.');
 const tvMount=document.createElement('div');tvMount.className='aurevia-calendar-tv-mount';
 tvSection.append(tvHeading,tvDescription,tvMount);
 root.append(structured,tvSection);container.replaceChildren(root);
 // Le widget est monté immédiatement : il ne dépend plus d’un clic sur un accordéon.
 const load=async()=>{
  structured.replaceChildren(el('p','calendar-loading','Chargement des événements économiques…'));
  try{
   const token=await getToken?.();if(!token)throw new Error('Connectez-vous pour consulter le calendrier économique.');
   const response=await fetch('/api/economic-calendar',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(payload.error||`Calendrier indisponible (HTTP ${response.status}).`);
   if(!Array.isArray(payload.events))throw new Error('La source a retourné un calendrier invalide.');
   if(!disposed)renderCalendar(structured,payload);
  }catch(error){if(!disposed)renderError(structured,error.message,load);}
 };
 load();
 renderTradingView(tvMount);
 return ()=>{disposed=true;};
}
