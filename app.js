import { loadInstrumentAnalysis, getAnalysisState } from './analysis.js';
import { getMarketStatus } from './market-hours.js';
import { calculatePositionRisk } from './risk.js';
import { initJournal, addJournalTrade, renderJournal, loadJournalTrades, deleteJournalTrade } from './journal.js';
import { initEconomicCalendar } from './news.js';
import { initAuth, confirmInApp, createTelegramPairingCode, loadTelegramPreferences, saveTelegramPreferences, unlinkTelegramAccount, sendTelegramTest, loadPublishedAnnouncements, markAnnouncementAsRead, markAllAnnouncementsAsRead, syncTradeGroupToSupabase, syncTradeCloseToSupabase, sendTelegramNotification, getAnalysisAccessToken, loadAccountCurrency, saveAccountCurrency, restoreTradeGroupsFromSupabase, deleteClosedTradeGroupFromSupabase } from './auth.js';
import { createTradeGroup, saveTradeGroup, loadTradeGroups, loadLinkedJournal, persistTradeGroup, recordPartialClose, groupSummary, mergeRestoredTradeGroups, deleteClosedTradeGroup, editOpenTradeGroup } from './trade-management.js';
import { validateContractSpec } from './contract-engine.js';
import { inferQuoteCurrency, validateFxSnapshot } from './fx-conversion.js';

const $ = id => document.getElementById(id);
const symbols = {
  XAUUSD:{label:'XAU/USD',tv:'OANDA:XAUUSD'},XAGUSD:{label:'XAG/USD',tv:'OANDA:XAGUSD'},
  EURUSD:{label:'EUR/USD',tv:'OANDA:EURUSD'},GBPUSD:{label:'GBP/USD',tv:'OANDA:GBPUSD'},USDJPY:{label:'USD/JPY',tv:'OANDA:USDJPY'},AUDUSD:{label:'AUD/USD',tv:'OANDA:AUDUSD'},
  USDCAD:{label:'USD/CAD',tv:'OANDA:USDCAD'},USDCHF:{label:'USD/CHF',tv:'OANDA:USDCHF'},NZDUSD:{label:'NZD/USD',tv:'OANDA:NZDUSD'},EURGBP:{label:'EUR/GBP',tv:'OANDA:EURGBP'},EURJPY:{label:'EUR/JPY',tv:'OANDA:EURJPY'},GBPJPY:{label:'GBP/JPY',tv:'OANDA:GBPJPY'},
  US30:{label:'US30',tv:'PEPPERSTONE:US30'},NAS100:{label:'NASDAQ 100',tv:'NASDAQ:NDX'},SPX500:{label:'S&P 500',tv:'SP:SPX'},GER40:{label:'DAX 40',tv:'XETR:DAX'},UK100:{label:'FTSE 100',tv:'TVC:UKX'},JPN225:{label:'Nikkei 225',tv:'TVC:NI225'},
  USOIL:{label:'WTI / US Oil',tv:'TVC:USOIL'},UKOIL:{label:'Brent',tv:'TVC:UKOIL'},
  AAPL:{label:'Apple',tv:'NASDAQ:AAPL'},MSFT:{label:'Microsoft',tv:'NASDAQ:MSFT'},NVDA:{label:'NVIDIA',tv:'NASDAQ:NVDA'},TSLA:{label:'Tesla',tv:'NASDAQ:TSLA'},AMZN:{label:'Amazon',tv:'NASDAQ:AMZN'},
  BTCUSD:{label:'BTC/USD',tv:'BITSTAMP:BTCUSD'},ETHUSD:{label:'ETH/USD',tv:'BITSTAMP:ETHUSD'},SOLUSD:{label:'SOL/USD',tv:'COINBASE:SOLUSD'},XRPUSD:{label:'XRP/USD',tv:'BITSTAMP:XRPUSD'}
};
let selectedSymbol='XAUUSD', selectedTf='15';
let accountCurrency=null;
let tradingViewMountToken=0, tradingViewRetryTimer=null, tradingViewResizeObserver=null;
let deferredInstallPrompt=null;
async function refreshSelectedQuote(){
  const label=$('selectedQuoteSymbol'),price=$('selectedQuotePrice'),status=$('selectedQuoteStatus');
  if(label)label.textContent=symbols[selectedSymbol]?.label||selectedSymbol;
  if(price)price.textContent='—';
  if(status)status.textContent='Chargement du cours vérifié…';
  try{
    const token=await getAnalysisAccessToken();
    if(!token)throw new Error('Connectez-vous pour consulter le cours.');
    const response=await fetch(`/api/market-quote?symbol=${encodeURIComponent(symbols[selectedSymbol].label)}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!Number.isFinite(Number(data.price)))throw new Error(data.error||'Cours indisponible');
    const value=Number(data.price),digits=selectedSymbol.endsWith('JPY')?3:(['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDCAD','USDCHF','EURGBP'].includes(selectedSymbol)?5:(['BTCUSD','ETHUSD'].includes(selectedSymbol)?2:2));
    if(price)price.textContent=value.toLocaleString('fr-FR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
    if(status)status.textContent=`Twelve Data · ${new Date(data.fetchedAt||Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`;
  }catch(error){if(status)status.textContent=error.message||'Cours non disponible';}
}
function initAppInstallation(){
 const button=$('installAppBtn'),status=$('installAppStatus');if(!button||!status)return;
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
 if(standalone()){button.textContent='Application installée';button.disabled=true;status.textContent='AUREVIA COPILOT est déjà installée sur cet appareil.';}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;button.disabled=false;status.textContent='Installation disponible sur cet appareil.';});
 window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;button.textContent='Application installée';button.disabled=true;status.textContent='Installation terminée.';});
 button.addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();const choice=await deferredInstallPrompt.userChoice;status.textContent=choice?.outcome==='accepted'?'Installation acceptée.':'Installation non effectuée.';deferredInstallPrompt=null;return;}
   const ua=navigator.userAgent||'';if(/iPhone|iPad|iPod/i.test(ua)){status.textContent='Sur iPhone : dans Safari, touchez Partager puis « Sur l’écran d’accueil ». Confirmez avec Ajouter.';}else if(/Android/i.test(ua)){status.textContent='Dans Chrome, ouvrez le menu ⋮ puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ». ';}else{status.textContent='Dans votre navigateur, ouvrez le menu d’installation ou « Installer AUREVIA COPILOT ». Le site doit être ouvert en HTTPS.';}
 });
}


function syncMarketAvailability(){
  const status=getMarketStatus(selectedSymbol),button=$('analyzeBtn');
  if(button)button.disabled=!status.tradable;
  if(!status.tradable){if($('signalState'))$('signalState').textContent='MARCHÉ FERMÉ';if($('signalExplain'))$('signalExplain').textContent=status.reason;if($('analyzeStatus'))$('analyzeStatus').textContent=`Analyse désactivée · ${status.schedule}`;}
  else if($('signalState')?.textContent==='MARCHÉ FERMÉ'){if($('signalState'))$('signalState').textContent='PRÊT';if($('signalExplain'))$('signalExplain').textContent=`${symbols[selectedSymbol]?.label||selectedSymbol} : marché ouvert. Vous pouvez lancer une analyse.`;if($('analyzeStatus'))$('analyzeStatus').textContent='Marché ouvert · analyse disponible.';}
}
function updateClock(){
  const now=new Date();
  syncMarketAvailability();
  const time=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Ouagadougou',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
  const date=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Ouagadougou',weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(now);
  $('topClock').textContent=time;$('fullClock').textContent=time;$('fullDate').textContent=date;
  renderSessions(now);
}
function zonedParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type==='hour'||p.type==='minute').map(p=>[p.type,Number(p.value)]));
}
function zoneOffsetMinutes(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const v=Object.fromEntries(parts.map(p=>[p.type,Number(p.value)]));
  return (Date.UTC(v.year,v.month-1,v.day,v.hour,v.minute,v.second)-Math.floor(date.getTime()/1000)*1000)/60000;
}
function renderSessions(now){
  const sessions=[
    {name:'Sydney',zone:'Australia/Sydney',open:8,close:17},
    {name:'Tokyo',zone:'Asia/Tokyo',open:9,close:18},
    {name:'Londres',zone:'Europe/London',open:8,close:17},
    {name:'New York',zone:'America/New_York',open:8,close:17}
  ];
  const html=sessions.map(s=>{const p=zonedParts(now,s.zone),minute=p.hour*60+p.minute,start=s.open*60,end=s.close*60,open=minute>=start&&minute<end,offset=zoneOffsetMinutes(now,s.zone),bfStart=((start-offset)%1440+1440)%1440,bfEnd=((end-offset)%1440+1440)%1440;return `<div class="session ${open?'open':''}"><span class="state">${open?'OUVERTE':'FERMÉE'}</span><b>${s.name}</b><small>${formatMinutes(bfStart)} – ${formatMinutes(bfEnd)} · heure Burkina Faso (UTC)</small></div>`}).join('');
  if($('sessionList'))$('sessionList').innerHTML=html;if($('homeSessionList'))$('homeSessionList').innerHTML=html;
}
function formatMinutes(m){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function mountTradingView(){
  const container=$('tvChart');if(!container)return;
  const token=++tradingViewMountToken;
  if(tradingViewRetryTimer){clearInterval(tradingViewRetryTimer);tradingViewRetryTimer=null;}
  if(tradingViewResizeObserver){tradingViewResizeObserver.disconnect();tradingViewResizeObserver=null;}
  // TradingView ne mesure pas correctement un conteneur initialisé dans une page masquée.
  const visible=container.getClientRects().length>0&&container.clientWidth>0&&container.clientHeight>0;
  if(!visible){container.innerHTML='<div class="chart-placeholder"><b>Graphique prêt à charger</b><small>Ouvrez l’espace Marchés pour initialiser le graphique.</small></div>';return;}
  container.innerHTML='<div class="chart-placeholder"><span class="pulse-ring">◈</span><b>Initialisation du graphique</b><small>Chargement du fournisseur externe…</small></div>';
  const make=()=>{
    if(token!==tradingViewMountToken)return;
    if(!container.getClientRects().length||container.clientWidth===0)return;
    if(!window.TradingView){container.innerHTML='<div class="chart-placeholder"><b>Graphique indisponible</b><small>Le widget TradingView ne répond pas. Vérifiez votre connexion.</small></div>';return;}
    const mount=document.createElement('div');mount.id='tvChartWidgetMount';mount.style.width='100%';mount.style.height='100%';mount.style.minWidth='0';
    container.replaceChildren(mount);
    try{
      new window.TradingView.widget({autosize:true,symbol:symbols[selectedSymbol].tv,interval:selectedTf,timezone:'Etc/UTC',theme:'dark',style:'1',locale:'fr',enable_publishing:false,allow_symbol_change:false,hide_top_toolbar:false,hide_legend:false,save_image:false,container_id:mount.id,backgroundColor:'#0b0910',gridColor:'#24192c',studies:['STD;EMA'],withdateranges:true});
      $('chartStatus').textContent='Widget TradingView initialisé';
      if(typeof ResizeObserver!=='undefined'){
        tradingViewResizeObserver=new ResizeObserver(()=>{
          if(token!==tradingViewMountToken)return;
          const frame=mount.querySelector('iframe');if(frame){frame.style.width='100%';frame.style.height='100%';}
        });
        tradingViewResizeObserver.observe(container);
      }
    }catch(e){container.innerHTML='<div class="chart-placeholder"><b>Graphique indisponible</b><small>Impossible d’initialiser TradingView. Réessayez après avoir vérifié votre connexion.</small></div>';}
  };
  if(window.TradingView)make();
  else{
    let attempts=0;
    tradingViewRetryTimer=setInterval(()=>{
      attempts++;
      if(token!==tradingViewMountToken){clearInterval(tradingViewRetryTimer);tradingViewRetryTimer=null;return;}
      if(window.TradingView||attempts>25){clearInterval(tradingViewRetryTimer);tradingViewRetryTimer=null;make();}
    },200);
  }
}
function mountTickerTape(){
  const box=$('multiQuotesWidget');if(!box||box.dataset.loaded==='1')return;
  const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';script.async=true;
  script.text=JSON.stringify({symbols:[
    {proName:'OANDA:XAUUSD',title:'Or / USD'},{proName:'OANDA:XAGUSD',title:'Argent / USD'},
    {proName:'OANDA:EURUSD',title:'EUR/USD'},{proName:'OANDA:GBPUSD',title:'GBP/USD'},
    {proName:'OANDA:USDJPY',title:'USD/JPY'},{proName:'PEPPERSTONE:US30',title:'US30'},
    {proName:'NASDAQ:NDX',title:'NASDAQ 100'},{proName:'SP:SPX',title:'S&P 500'},
    {proName:'TVC:DXY',title:'Dollar Index'},{proName:'TVC:USOIL',title:'WTI'},
    {proName:'BITSTAMP:BTCUSD',title:'Bitcoin'},{proName:'NASDAQ:NVDA',title:'NVIDIA'}
  ],showSymbolLogo:true,isTransparent:true,displayMode:'adaptive',colorTheme:'dark',locale:'fr'});
  const wrapper=document.createElement('div');wrapper.className='tradingview-widget-container';wrapper.style.width='100%';
  const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';wrapper.append(widget,script);
  box.replaceChildren(wrapper);box.dataset.loaded='1';
}
function mountDxyChart(){
  const box=$('dxyChart');if(!box||box.dataset.loaded==='1')return;
  const frame=document.createElement('iframe');
  frame.title='Graphique Dollar Index DXY sur TradingView';
  frame.loading='lazy';frame.referrerPolicy='no-referrer-when-downgrade';
  frame.src='https://s.tradingview.com/widgetembed/?frameElementId=dxy_chart&symbol=TVC%3ADXY&interval=60&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=0b0910&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&locale=fr';
  box.replaceChildren(frame);box.dataset.loaded='1';
}
function setSelectedSymbol(symbol){
  if(!symbols[symbol])return;
  selectedSymbol=symbol;
  if($('instrumentSelect'))$('instrumentSelect').value=symbol;
  if($('analysisInstrumentSelect'))$('analysisInstrumentSelect').value=symbol;
  document.querySelectorAll('.ticker').forEach(t=>{const active=t.dataset.symbol===symbol;t.classList.toggle('active',active);t.setAttribute('aria-pressed',String(active));});
  refreshSelectedQuote();
  mountTradingView();
  $('signalState').textContent='PRÊT';
  $('signalExplain').textContent=`${symbols[symbol].label} sélectionné. Lancez l’analyse pour demander à Groq d’étudier cette paire sur M15.`;
  const marketStatus=getMarketStatus(symbol);
  $('analyzeBtn').disabled=!marketStatus.tradable;
  $('analyzeStatus').textContent=marketStatus.tradable?'Paire sélectionnée · analyse en attente de votre demande.':`MARCHÉ FERMÉ · ${marketStatus.schedule}. Analyse désactivée jusqu’à la réouverture.`;
  if(!marketStatus.tradable){$('signalState').textContent='MARCHÉ FERMÉ';$('signalExplain').textContent=marketStatus.reason;}
  $('probabilityValue').textContent='—';
  $('probabilityBar').style.width='0%';
  $('aiTradePlan').hidden=true;
  $('aiScenarios').hidden=true;
}
function setTimeframe(tf){selectedTf=tf;document.querySelectorAll('#timeframes button').forEach(b=>b.classList.toggle('selected',b.dataset.tf===tf));mountTradingView();}
async function loadAnalysis(){
  const marketStatus=getMarketStatus(selectedSymbol);
  if(!marketStatus.tradable){$('signalState').textContent='MARCHÉ FERMÉ';$('signalExplain').textContent=marketStatus.reason;$('analyzeStatus').textContent=`Analyse désactivée · ${marketStatus.schedule}`;if($('analyzeBtn'))$('analyzeBtn').disabled=true;return;}
  const analyzeButton=$('analyzeBtn'),analyzeStatus=$('analyzeStatus');
  if(analyzeButton){analyzeButton.disabled=true;analyzeButton.textContent='Analyse en cours…';}
  if(analyzeStatus)analyzeStatus.textContent=`Chargement prioritaire M15 puis contexte H4 / H1 / M30 · M5/M1 sur TradingView…`;
  $('signalState').textContent='ANALYSE M15';$('signalExplain').textContent='Calcul du scénario à partir des seules données M15…';$('probabilityValue').textContent='—';$('probabilityBar').style.width='0%';
  let result;
  try{result=await loadInstrumentAnalysis(selectedSymbol);}finally{if(analyzeButton){analyzeButton.disabled=!getMarketStatus(selectedSymbol).tradable;analyzeButton.textContent='⌁ Analyser le marché';}}
  const state=getAnalysisState();
  if(result?.price){const price=$(`price-${selectedSymbol}`),change=$(`change-${selectedSymbol}`);if(price)price.textContent=Number(result.price).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});if(change)change.textContent=`Twelve Data · OHLC M15 · ${result.status}`;}
  $('chartSource').textContent='Décision & chiffres : M15 · H4/H1/M30 contexte · M5/M1 sur TradingView pour la précision';
  $('chartStatus').textContent=state.message||'Données externes';
  $('mtfRows').innerHTML=state.rows?.length?state.rows.map(r=>`<tr><td>${r.tf}</td><td>${r.ema200===null?'—':Number(r.ema200).toFixed(2)}</td><td>${r.rsi14===null?'—':Number(r.rsi14).toFixed(1)}</td><td>${escapeText(r.bias)} · ${escapeText(r.breaks)}</td></tr>`).join(''):`<tr><td colspan="4" class="empty-cell">${state.tableMessage||'Données multi-timeframes indisponibles.'}</td></tr>`;
  const availablePlans=['buy','sell'].filter(side=>['IDENTIFIED','WATCH'].includes(state.scenarios?.[side]?.status));
  $('signalState').textContent=(state.decision==='WAIT'&&availablePlans.length)?'PLANS CHIFFRÉS':(state.decision||'WAIT');const macro=state.macroContext;$('signalExplain').textContent=(state.signalReason||'WAIT : données ou confirmations insuffisantes. Aucune probabilité n’est publiée sans calibration historique.')+(selectedSymbol==='XAUUSD'?`\n\nContexte macro : ${macro?.configured?`source FRED · dernières observations au ${macro.asOf||'date inconnue'} · DXY, rendements, taux Fed, CPI et chômage transmis au moteur (données retardées).`:(macro?.notice||'Données macro non disponibles ; aucun biais macro n’est supposé.')}`:'');
  if(analyzeStatus)analyzeStatus.textContent=state.message||'Analyse terminée.';
  $('probabilityValue').textContent=Number.isFinite(state.score)?`${state.score} / 100`:'—';$('probabilityBar').style.width=`${Number.isFinite(state.score)?Math.max(0,Math.min(100,state.score)):0}%`;
  renderAITradePlan(state);
  renderAIScenarios(state);
  renderStructureAnalysis(state);
  if(state.analysis)notifyLatestAnalysis(state,selectedSymbol).catch(()=>{});
}
function renderAITradePlan(state){
  const host=$('aiTradePlan');if(!host)return;
  const d=state.decisionDetails||{},candidate=d.scenarios?.[String(state.decision||'').toLowerCase()]||state.scenarios?.[String(state.decision||'').toLowerCase()];
  const valid=['BUY','SELL'].includes(state.decision)&&candidate&&Number.isFinite(Number(candidate.entry))&&Number.isFinite(Number(candidate.stopLoss))&&Array.isArray(candidate.takeProfits)&&candidate.takeProfits.length>0;
  host.hidden=!valid;
  if(!valid)return;
  $('aiOrderType').textContent=candidate.pendingOrderType||'À confirmer';
  $('aiEntry').textContent=String(candidate.entry);
  $('aiTrigger').textContent=candidate.triggerPrice===null||candidate.triggerPrice===undefined?'—':String(candidate.triggerPrice);
  $('aiLimit').textContent=candidate.limitPrice===null||candidate.limitPrice===undefined?'—':String(candidate.limitPrice);
  $('aiStopLoss').textContent=String(candidate.stopLoss);
  $('aiTakeProfits').textContent=candidate.takeProfits.join(' · ');
  $('aiInvalidation').textContent='Invalidation : '+(candidate.invalidation||'Non précisée par Groq.');
}


async function refreshScenarioWatchList(){
 const host=$('scenarioWatchList');if(!host||!window.__aureviaAuthenticated)return;
 host.textContent='Chargement des scénarios surveillés…';
 try{
  const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion requise.');
  const response=await fetch('/api/scenario',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action:'list'}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Chargement des scénarios impossible.');
  const rows=data.scenarios||[];
  if(!rows.length){host.innerHTML='<div class="empty-cell">Aucun scénario enregistré. Après confrontation de ta zone d’entrée, valide la synthèse pour lancer la surveillance.</div>';return;}
  const statusLabel={monitoring:'Surveillance M15',zone_reached:'Zone atteinte · confirmation M15 attendue',entry_confirmed:'Entrée confirmée · enregistrement disponible',stopped:'Surveillance arrêtée',invalidated:'Scénario invalidé'};
  host.innerHTML=rows.map(s=>{
   const confirmed=s.status==='entry_confirmed'&&!s.trade_group_id&&s.lot_confirmation_expires_at&&Date.parse(s.lot_confirmation_expires_at)>Date.now();
   const already=Boolean(s.trade_group_id);
   const expires=confirmed?` · expiration ${new Date(s.lot_confirmation_expires_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`:'';
   return `<article class="scenario-watch-card"><header><strong>${escapeText(s.instrument)} · ${escapeText(s.direction)}</strong><span>${escapeText(statusLabel[s.status]||s.status)}</span></header>
    <div class="scenario-watch-levels"><span>Zone <b>${escapeText(s.entry_low)} – ${escapeText(s.entry_high)}</b></span><span>Entrée indicative <b>${escapeText(s.entry)}</b></span><span>SL <b>${escapeText(s.stop_loss)}</b></span><span>TP <b>${(s.take_profits||[]).map(escapeText).join(' · ')}</b></span><span>Dernier prix <b>${escapeText(s.last_price??'—')}</b></span></div>
    ${already?'<p class="muted">Position déjà créée. Le suivi et le journal sont actifs.</p>':confirmed?`<div class="scenario-direct-entry"><label>Lot à enregistrer<input type="number" min="0.0001" step="0.0001" data-scenario-lot="${escapeText(s.id)}" placeholder="Ex. 0.05"></label><label>Mode de gestion<select data-scenario-mode="${escapeText(s.id)}"><option value="unique">Position unique · lot total réparti entre TP</option><option value="separate">Trades séparés · lot par TP</option></select></label><button class="primary-btn" type="button" data-scenario-register="${escapeText(s.id)}">Enregistrer directement dans AUREVIA</button><small>Ou utilise la notification privée Telegram déjà envoyée pour confirmer le lot depuis le bot.${expires}</small><p data-scenario-status="${escapeText(s.id)}" aria-live="polite"></p></div>`:s.status==='monitoring'||s.status==='zone_reached'?'<p class="muted">L’enregistrement sera proposé après la confirmation d’entrée M15.</p>':'<p class="muted">Ce scénario n’est plus actif.</p>'}
   </article>`;
  }).join('');
  host.querySelectorAll('[data-scenario-register]').forEach(button=>button.addEventListener('click',async()=>{
   const id=button.dataset.scenarioRegister,lot=Number(host.querySelector(`[data-scenario-lot="${id}"]`)?.value),mode=host.querySelector(`[data-scenario-mode="${id}"]`)?.value||'unique',status=host.querySelector(`[data-scenario-status="${id}"]`);
   try{
    if(!Number.isFinite(lot)||lot<=0)throw new Error('Saisis un lot valide.');
    button.disabled=true;if(status)status.textContent='Enregistrement sécurisé en cours…';
    const freshToken=await getAnalysisAccessToken();const r=await fetch('/api/scenario',{method:'POST',headers:{authorization:`Bearer ${freshToken}`,'content-type':'application/json'},body:JSON.stringify({action:'create_position',id,mode,volume:lot}),cache:'no-store'});
    const result=await r.json().catch(()=>({}));if(!r.ok)throw new Error(result.error||'Création de la position impossible.');
    if(status)status.textContent='Position enregistrée. Actualisation du suivi et du journal…';
    const restored=await restoreTradeGroupsFromSupabase();if(restored.restored){mergeRestoredTradeGroups(restored.groups,restored.journal);renderPositions();renderLinkedJournal();renderJournal();}
    await refreshScenarioWatchList();
   }catch(error){if(status)status.textContent=error.message||'Enregistrement impossible.';button.disabled=false;}
  }));
 }catch(error){host.textContent=error.message||'Impossible de charger les scénarios.';}
}

function renderAIScenarios(state){
  const host=$('aiScenarios'),grid=$('aiScenariosGrid');if(!host||!grid)return;
  const scenarios=state.decisionDetails?.scenarios||state.scenarios||{};
  const entries=[['BUY',scenarios.buy],['SELL',scenarios.sell]].filter(([,x])=>x&&['IDENTIFIED','WATCH'].includes(x.status));
  host.hidden=!entries.length;
  if(!entries.length){grid.innerHTML='';return;}
  const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  grid.innerHTML=entries.map(([side,x])=>`<article class="ai-scenario-card ${side.toLowerCase()}"><header><strong>${side} POTENTIEL</strong><span>${x.confidenceLabel|| (x.entryStatus==='CONFIRMED'?'ENTRÉE CONFIRMÉE':'EN ATTENTE DU DÉCLENCHEUR')}</span></header><p>${esc(x.reason)}</p><dl><div><dt>Zone à surveiller</dt><dd>${esc(x.entryZoneLow)} – ${esc(x.entryZoneHigh)}</dd></div><div><dt>Probabilité estimée par Groq</dt><dd>${Number.isFinite(Number(x.probability))?esc(x.probability)+' %':'Non fournie'} · ${esc(x.probabilityStatus==='ESTIMATION_IA_NON_CALIBREE'?'non calibrée':'à vérifier')}</dd></div><div><dt>Score de confirmation</dt><dd>${esc(x.score??'—')} / 100</dd></div><div><dt>Type d’ordre potentiel</dt><dd>${esc(x.pendingOrderType||'À déterminer')}</dd></div><div><dt>Entrée indicative</dt><dd>${esc(x.entry)}</dd></div><div><dt>Déclenchement</dt><dd>${esc(x.triggerPrice??'—')}</dd></div><div><dt>Prix limite</dt><dd>${esc(x.limitPrice??'—')}</dd></div><div><dt>Stop Loss</dt><dd>${esc(x.stopLoss)}</dd></div><div><dt>Objectifs</dt><dd>${(x.takeProfits||[]).map(esc).join(' · ')||'—'}</dd></div></dl><section><b>Conditions d’activation</b><ul>${(x.activationConditions||[]).map(v=>`<li>${esc(v)}</li>`).join('')||'<li>Voir les confirmations de structure.</li>'}</ul></section><p><b>Raisonnement de Groq :</b> ${esc(x.humanReasoning||x.reason||'—')}</p><p><b>Estimation :</b> ${esc(x.probabilityRationale||'Estimation IA non calibrée, à confirmer sur un historique.')}</p><p><b>Logique de l’ordre :</b> ${esc(x.orderRationale||'Type proposé selon la position de la zone par rapport au dernier cours.')}</p><p><b>Déclencheur :</b> ${esc(x.entryTrigger)}</p><p><b>Invalidation :</b> ${esc(x.invalidation)}</p></article>`).join('');
}

function renderStructureAnalysis(state){
  const cards=$('structureCards'),checks=$('confluenceChecks'),patternsHost=$('patternList');
  if(!cards||!checks||!patternsHost)return;
  if(!state.analysis){cards.innerHTML='<div class="structure-card muted">'+escapeText(state.tableMessage||'Historiques OHLC indisponibles.')+'</div>';checks.innerHTML='<span class="muted">Confluence indisponible.</span>';patternsHost.innerHTML='<span class="muted">Aucune figure analysée.</span>';return;}
  let timeframeCards=['H4','H1','M30','M15'].map(tf=>{const a=state.analysis[tf];if(!a)return `<article class="structure-card muted"><div class="structure-card-head"><b>${tf}</b><span>Contexte indisponible</span></div><p>Le flux optionnel n'a pas fourni de données valides. La décision reste fondée sur M15.</p></article>`;const st=a.structure,ind=a.indicators,sw=st.swings||[],high=sw.filter(x=>x.type==='high').at(-1),low=sw.filter(x=>x.type==='low').at(-1);const breaks=(st.breaks||[]).map(x=>x.type).join(' · ')||'Aucune cassure confirmée';const sweeps=(st.sweeps||[]).map(x=>x.type).join(' · ')||'Aucun sweep confirmé';return `<article class="structure-card"><div class="structure-card-head"><b>${tf}</b><span>${escapeText(st.bias||'indéterminé')}</span></div><div class="structure-metrics"><span>EMA20 <b>${ind.ema20===null?'—':Number(ind.ema20).toFixed(2)}</b></span><span>EMA50 <b>${ind.ema50===null?'—':Number(ind.ema50).toFixed(2)}</b></span><span>EMA100 <b>${ind.ema100===null?'—':Number(ind.ema100).toFixed(2)}</b></span><span>EMA200 <b>${ind.ema200===null?'—':Number(ind.ema200).toFixed(2)}</b></span><span>RSI14 <b>${ind.rsi14===null?'—':Number(ind.rsi14).toFixed(1)}</b></span><span>MACD <b>${ind.macd?Number(ind.macd.line).toFixed(3):'—'}</b></span><span>ATR14 <b>${ind.atr14===null?'—':Number(ind.atr14).toFixed(3)}</b></span><span>BB haute / basse <b>${ind.bollinger?Number(ind.bollinger.upper).toFixed(2)+' / '+Number(ind.bollinger.lower).toFixed(2):'—'}</b></span></div><p><small>Structure</small>${escapeText(breaks)}</p><p><small>Liquidité</small>${escapeText(sweeps)}</p><p><small>FVG / OB candidats</small>${(st.fvg||[]).filter(x=>!x.mitigated).length} FVG actifs · ${(st.orderBlocks||[]).filter(x=>!x.mitigated).length} OB non mitigés</p><p><small>Fibonacci 38,2 / 50 / 61,8</small>${a.fibonacci?a.fibonacci.levels.map(x=>Number(x.price).toFixed(2)).join(' · '):'Indisponible'}</p><p><small>Volume Profile fixe · POC / VAL / VAH</small>${a.volumeProfile?[a.volumeProfile.poc,a.volumeProfile.val,a.volumeProfile.vah].map(x=>Number(x).toFixed(2)).join(' · '):'Volume indisponible ou historique insuffisant'}</p><p><small>Derniers niveaux</small>H ${high?Number(high.price).toFixed(2):'—'} · L ${low?Number(low.price).toFixed(2):'—'}</p></article>`;}).join('');
  timeframeCards += `<article class="structure-card muted"><div class="structure-card-head"><b>M5 / M1</b><span>Affinage manuel</span></div><p>Utilisez les graphiques TradingView M5/M1 pour affiner le timing. Ces unités ne sont pas interrogées par le moteur OHLC afin de limiter les appels fournisseur.</p></article>`;
  cards.innerHTML=timeframeCards;
  checks.innerHTML=(state.scoreComponents||[]).map(x=>`<span class="confluence-item ${x.passed?'passed':'pending'}"><b>${x.passed?'✓':'○'}</b>${escapeText(x.label)}</span>`).join('')||'<span class="muted">Confluence indisponible.</span>';
  const found=(state.analysis.M15?.patterns||[]).map(p=>({tf:'M15',...p}));
  patternsHost.innerHTML=found.length?found.map(p=>`<span class="pattern-chip"><b>${escapeText(p.name)}</b><small>${p.tf} · ${escapeText(p.confirmation||'à confirmer')}</small></span>`).join(''):'<span class="muted">Aucune figure détectée sur les dernières bougies.</span>';
}
async function notifyLatestAnalysis(state,symbol){
  const candle=state.frames?.M15?.candles?.at(-1)?.time;if(!candle)return;
  const key=`${symbol}:${candle}:${state.decision||'WAIT'}`;
  if(localStorage.getItem('aurevia_last_telegram_analysis')===key)return;
  const details=state.decisionDetails||{};
  const lines=[`AUREVIA COPILOT · ${symbol}`,`Décision : ${state.decision||'WAIT'}`,`Score de confluence : ${Number.isFinite(state.score)?state.score+'/100':'indisponible'}`,`Motif : ${details.reason||state.signalReason||'Confluence insuffisante.'}`];
  if(state.decision==='BUY'||state.decision==='SELL'){
    lines.push(`Type d'ordre : ${details.pendingOrderType||'non proposé'}`);
    if(details.entry!==null&&details.entry!==undefined)lines.push(`Entrée : ${details.entry}`);
    if(details.triggerPrice!==null&&details.triggerPrice!==undefined)lines.push(`Déclenchement : ${details.triggerPrice}`);
    if(details.limitPrice!==null&&details.limitPrice!==undefined)lines.push(`Limite : ${details.limitPrice}`);
    if(details.stopLoss!==null&&details.stopLoss!==undefined)lines.push(`Stop Loss : ${details.stopLoss}`);
    if(Array.isArray(details.takeProfits)&&details.takeProfits.length)lines.push(`Take Profits : ${details.takeProfits.join(' · ')}`);
    if(details.invalidation)lines.push(`Invalidation : ${details.invalidation}`);
  }
  const result=await sendTelegramNotification({type:state.decision==='BUY'||state.decision==='SELL'?'signal':'analysis',text:lines.join('\n')});
  if(result.sent||result.reason==='disabled_by_user')localStorage.setItem('aurevia_last_telegram_analysis',key);
}

function updateScenarioEditorMeta(){
 const text=$('scenarioFinalSummary')?.value||'';
 if($('scenarioCharCount'))$('scenarioCharCount').textContent=`${text.length.toLocaleString('fr-FR')} caractère${text.length>1?'s':''}`;
 if($('summaryMetaInstrument'))$('summaryMetaInstrument').textContent=$('myAnalysisInstrument')?.selectedOptions?.[0]?.text||selectedSymbol;
 if($('summaryMetaDirection'))$('summaryMetaDirection').textContent=$('myAnalysisDirection')?.selectedOptions?.[0]?.text||'À définir';
 if($('summaryMetaStatus'))$('summaryMetaStatus').textContent=text.trim()?'À valider':'En attente';
 if($('summaryMetaEdited'))$('summaryMetaEdited').textContent=text.trim()?new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'—';
}
function saveScenarioDraft(){
 const text=$('scenarioFinalSummary')?.value||'';
 localStorage.setItem('aurevia_scenario_summary_draft',JSON.stringify({text,updatedAt:new Date().toISOString(),instrument:$('myAnalysisInstrument')?.value||selectedSymbol,direction:$('myAnalysisDirection')?.value||'WAIT'}));
 if($('scenarioDraftBadge'))$('scenarioDraftBadge').textContent='BROUILLON MODIFIÉ';updateScenarioEditorMeta();
}
function restoreScenarioDraft(){
 try{const d=JSON.parse(localStorage.getItem('aurevia_scenario_summary_draft')||'null');if(!d?.text){$('scenarioSaveStatus').textContent='Aucun brouillon local à restaurer.';return;}$('scenarioFinalSummary').value=d.text;if(d.instrument&&$('myAnalysisInstrument'))$('myAnalysisInstrument').value=d.instrument;if(d.direction&&$('myAnalysisDirection'))$('myAnalysisDirection').value=d.direction;$('scenarioSaveStatus').textContent='Brouillon local restauré. Vérifiez les niveaux avant enregistrement.';updateScenarioEditorMeta();if($('scenarioDraftBadge'))$('scenarioDraftBadge').textContent='BROUILLON RESTAURÉ';}catch{$('scenarioSaveStatus').textContent='Impossible de restaurer le brouillon local.';}
}
function structureScenarioSummary(){
 const area=$('scenarioFinalSummary'),raw=area?.value.trim();if(!area)return;
 if(!raw)area.value=['CONTEXTE DE MARCHÉ','Tendance supérieure (H4 / H1) :','Structure opérationnelle (M30 / M15) :','','CONFIRMATIONS TECHNIQUES','Liquidité / BOS / CHoCH :','Indicateurs et figures :','','PLAN DU SCÉNARIO','Direction :','Zone d’entrée :','Entrée indicative :','Stop Loss :','TP1 :','TP2 :','TP3 :','','CONDITIONS ET RISQUES','Déclencheur attendu (M5 / M1) :','Conditions d’activation :','Invalidation :','Risques / données manquantes :','','CONCLUSION','Décision et éléments restant à confirmer :'].join('\n');
 else if(!/^CONTEXTE DE MARCHÉ/m.test(raw))area.value=`CONTEXTE DE MARCHÉ\n${raw}\n\nCONFIRMATIONS TECHNIQUES\nÀ compléter : structure H4/H1/M30/M15, liquidité, BOS/CHoCH et indicateurs.\n\nPLAN DU SCÉNARIO\nDirection / entrée / zone / SL / TP : vérifier les niveaux issus de l’analyse avant validation.\n\nCONDITIONS ET RISQUES\nDéclencheur M5/M1 : à préciser.\nInvalidation : à préciser.\nRisques et données manquantes : à préciser.\n\nCONCLUSION\nScénario conditionnel. Aucune exécution automatique.`;
 saveScenarioDraft();$('scenarioSaveStatus').textContent='Structure professionnelle insérée. Complétez les rubriques sans ajouter de niveaux non vérifiés.';
}
async function saveScenarioFromUi(source='synthesis'){
 const status=$('scenarioSaveStatus'),button=source==='ai'?$('saveAiScenarioDirect'):$('saveFinalScenario');
 const instrument=$('myAnalysisInstrument')?.value||selectedSymbol,state=instrument===selectedSymbol?getAnalysisState():null;
 const decision=state?.decision;const direction=source==='ai'&&['BUY','SELL'].includes(decision)?decision:($('myAnalysisDirection')?.value||'WAIT');
 const candidate=state?.scenarios?.[direction.toLowerCase()];let summary=$('scenarioFinalSummary')?.value?.trim()||'';
 let confrontation=null;try{confrontation=JSON.parse(localStorage.getItem('aurevia_last_confrontation')||'null')}catch{}
 const currentAnalysis=readMyAnalysis();
 if(!confrontation||confrontation.instrument!==instrument||confrontation.direction!==direction||String(currentAnalysis.zoneLow)!==confrontation.zoneLow||String(currentAnalysis.zoneHigh)!==confrontation.zoneHigh){status.textContent='Confrontez d’abord votre zone d’entrée avec l’IA. Toute modification de la zone ou de la direction nécessite une nouvelle confrontation.';return;}
 if(!['BUY','SELL'].includes(direction)){status.textContent='Choisissez BUY ou SELL avant d’enregistrer un scénario à surveiller.';return;}
 if(!candidate||candidate.status!=='IDENTIFIED'){status.textContent=`Aucun scénario ${direction} identifié par le moteur pour ${instrument}. Impossible d’activer une surveillance sans niveaux techniques validés.`;return;}
 const low=Number(confrontation.zoneLow),high=Number(confrontation.zoneHigh),sl=Number(candidate.stopLoss),tps=(candidate.takeProfits||[]).map(Number).filter(Number.isFinite),aiEntry=Number(candidate.entry),entry=aiEntry>=low&&aiEntry<=high?aiEntry:(low+high)/2;
 if(![entry,low,high,sl].every(v=>Number.isFinite(v)&&v>0)||low>high||!tps.length){status.textContent='Les niveaux du scénario sont incomplets. Complétez l’analyse avant de l’enregistrer.';return;}
 if((direction==='BUY'&&(sl>=low||tps.some(v=>v<=high)))||(direction==='SELL'&&(sl<=high||tps.some(v=>v>=low)))){status.textContent='La zone confrontée n’est pas cohérente avec le SL ou les TP. Corrigez la zone ou relancez l’analyse.';return;}
 if(source==='ai'&&candidate){summary=[`AUREVIA COPILOT · PROPOSITION GROQ M15`,`${instrument} · ${direction}`,`Zone d’entrée confrontée : ${low} – ${high}`,`Entrée indicative : ${candidate.entry}`,`Stop Loss : ${candidate.stopLoss}`,`Take Profits : ${(candidate.takeProfits||[]).join(' / ')}`,`Probabilité estimée par Groq : ${candidate.probability??'non fournie'} % (non calibrée)`,`Score de confirmation : ${candidate.score??'—'}/100`,'',`Lecture du marché : ${candidate.reason||''}`,`Raisonnement : ${candidate.humanReasoning||''}`,`Conditions : ${(candidate.activationConditions||[]).join(' ; ')}`,`Déclencheur : ${candidate.entryTrigger||''}`,`Invalidation : ${candidate.invalidation||''}`].join('\n');if($('scenarioFinalSummary'))$('scenarioFinalSummary').value=summary;saveScenarioDraft();}if(!summary||summary.length<8){status.textContent='La synthèse est vide ou trop courte. Rédigez le compte rendu avant validation.';return;}
 button.disabled=true;status.textContent='Validation des niveaux et enregistrement sécurisé…';
 try{const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion requise pour enregistrer et surveiller un scénario.');
  const response=await fetch('/api/scenario',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action:'save',instrument,direction,entry_low:low,entry_high:high,entry,stop_loss:sl,take_profits:tps.slice(0,3),summary,source,order_type:candidate.pendingOrderType||null,estimated_win_rate:candidate.probability??null,probability_status:candidate.probabilityStatus||'ESTIMATION_IA_NON_CALIBREE',probability_rationale:candidate.probabilityRationale||'',confirmation_score:candidate.score??null,reasoning:candidate.humanReasoning||candidate.reason||''}),cache:'no-store'});
  const result=await response.json().catch(()=>({error:'Réponse serveur illisible.'}));if(!response.ok)throw new Error(result.error||'Enregistrement impossible.');
  status.textContent=`Scénario ${direction} enregistré. Surveillance AUREVIA activée. ${result.telegram?.sent?'Notification Telegram envoyée.':result.telegram?.reason==='not_connected'?'Telegram non connecté.':'Notification Telegram non envoyée.'}`;
  localStorage.removeItem('aurevia_scenario_summary_draft');if($('scenarioDraftBadge'))$('scenarioDraftBadge').textContent='ENREGISTRÉ';await refreshScenarioWatchList();
 }catch(error){status.textContent=error.message||'Erreur lors de l’enregistrement.';}finally{button.disabled=false;}
}

function readMyAnalysis(){
  return {instrument:$('myAnalysisInstrument').value,timeframe:$('myAnalysisTf').value,direction:$('myAnalysisDirection').value,entry:$('myAnalysisEntry').value.trim(),zoneLow:$('myAnalysisZoneLow')?.value.trim()||'',zoneHigh:$('myAnalysisZoneHigh')?.value.trim()||'',orderType:$('myAnalysisOrderType')?.value||'',sl:$('myAnalysisSL').value.trim(),tp:$('myAnalysisTP').value.trim(),structure:$('myAnalysisStructure').value.trim(),reason:$('myAnalysisReason').value.trim(),invalidation:$('myAnalysisInvalidation').value.trim(),updatedAt:new Date().toISOString()};
}
function renderAnalysisHistory(){
  const host=$('analysisHistoryList');if(!host)return;
  let items=[];try{items=JSON.parse(localStorage.getItem('aurevia_analysis_history')||'[]')}catch{}
  host.innerHTML=items.length?items.slice(0,8).map(x=>`<div class="history-item"><b>${new Date(x.date).toLocaleString('fr-FR')}</b> · ${x.instrument} ${x.timeframe} · <strong>${x.userDirection}</strong> / IA : <strong>${x.aiDirection}</strong><br>${escapeText(x.summary)}</div>`).join(''):'Aucune comparaison enregistrée.';
}
function escapeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function saveMyAnalysis(){
  const data=readMyAnalysis();localStorage.setItem('aurevia_my_analysis',JSON.stringify(data));
  $('myAnalysisStatus').textContent='Analyse personnelle enregistrée sur cet appareil.';
}
async function compareMyAnalysis(){
 const data=readMyAnalysis();saveMyAnalysis();
 const state=data.instrument===selectedSymbol?getAnalysisState():null;
 if(!state?.analysis||!state?.scenarios){$('independentAnalysisTitle').textContent='Analyse IA non disponible';$('independentAnalysisText').textContent='Lancez d’abord une analyse avec des bougies M15 valides et Groq disponible.';$('confrontationTitle').textContent='Confrontation en attente';$('confrontationText').textContent='Aucune confrontation réalisée : données M15 ou analyse Groq indisponibles.';return;}
 const candidate=state.scenarios[data.direction.toLowerCase()],aiDirection=candidate?.status==='IDENTIFIED'?data.direction:'WAIT';
 const button=$('compareMyAnalysis'),status=$('myAnalysisStatus');if(button)button.disabled=true;
 $('independentAnalysisTitle').textContent=`Analyse initiale de Groq · ${state.decision||'WAIT'} · ${state.score??'—'}/100`;
 $('independentAnalysisText').textContent=state.signalReason||'Analyse principale fondée sur M15.';
 $('confrontationTitle').textContent='Groq confronte les deux analyses…';$('confrontationText').textContent='Groq examine tes arguments, recherche les contradictions et prépare une synthèse indépendante.';
 try{
  const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion requise pour demander la confrontation à Groq.');
  const response=await fetch('/api/ai-confrontation',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({instrument:data.instrument,userAnalysis:data,aiAnalysis:{decision:state.decision,summary:state.decisionDetails?.reason||state.signalReason,marketReading:state.marketReading,scenarios:state.scenarios,risks:state.risks||[]}}),cache:'no-store'});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'La confrontation Groq a échoué.');
  localStorage.setItem('aurevia_last_confrontation',JSON.stringify({instrument:data.instrument,direction:data.direction,zoneLow:String(data.zoneLow),zoneHigh:String(data.zoneHigh),verdict:result.verdict,at:new Date().toISOString()}));
  const labels={ACCORD:'Accord global',DESACCORD:'Désaccord argumenté',PARTIEL:'Accord partiel',REVISION:'Groq révise sa position',INSUFFISANT:'Éléments insuffisants'};
  const blocks=[`CONFRONTATION GROQ / TRADER · ${data.instrument} · décision chiffrée M15`,`VERDICT : ${labels[result.verdict]||result.verdict}`];
  if(result.traderContribution)blocks.push(`CE QUE TON ANALYSE APPORTE\n${result.traderContribution}`);
  if(result.agreements?.length)blocks.push(`POINTS D’ACCORD\n${result.agreements.map(x=>'• '+x).join('\n')}`);
  if(result.disagreements?.length)blocks.push(`DÉSACCORDS ET CONTRADICTIONS\n${result.disagreements.map(x=>'• '+x).join('\n')}`);
  if(result.overlooked?.length)blocks.push(`ÉLÉMENTS OUBLIÉS OU À VÉRIFIER\n${result.overlooked.map(x=>'• '+x).join('\n')}`);
  if(result.groqPosition)blocks.push(`POSITION DE GROQ APRÈS CONFRONTATION\n${result.groqPosition}`);
  if(result.finalConclusion)blocks.push(`SYNTHÈSE FINALE\n${result.finalConclusion}`);
  if(result.watchConditions?.length)blocks.push(`CONDITIONS À SURVEILLER\n${result.watchConditions.map(x=>'• '+x).join('\n')}`);
  if(candidate?.status==='IDENTIFIED')blocks.push(`NIVEAUX M15 INITIAUX CONSERVÉS\nZone : ${candidate.entryZoneLow} – ${candidate.entryZoneHigh} · Entrée : ${candidate.entry} · SL : ${candidate.stopLoss} · TP : ${(candidate.takeProfits||[]).join(' / ')}\nProbabilité estimée par Groq : ${candidate.probability??'non fournie'} % (non calibrée).`);
  blocks.push('Les niveaux chiffrés initiaux ne sont pas modifiés par la confrontation. Si Groq recommande de nouveaux niveaux, relance une analyse M15 avant de créer une surveillance. Tu peux modifier cette synthèse avant son enregistrement.');
  const summary=blocks.join('\n\n');$('confrontationTitle').textContent=labels[result.verdict]||'Confrontation Groq terminée';$('confrontationText').textContent=summary;$('scenarioFinalSummary').value=summary;saveScenarioDraft();if($('scenarioDraftBadge'))$('scenarioDraftBadge').textContent='SYNTHÈSE GROQ · À RELIRE';
  let history=[];try{history=JSON.parse(localStorage.getItem('aurevia_analysis_history')||'[]')}catch{}history.unshift({date:new Date().toISOString(),instrument:data.instrument,timeframe:'M15',userDirection:data.direction,aiDirection,verdict:result.verdict,summary:result.finalConclusion||result.summary||summary});localStorage.setItem('aurevia_analysis_history',JSON.stringify(history.slice(0,30)));renderAnalysisHistory();
  if(status)status.textContent='Confrontation effectuée par Groq. Relis et modifie la synthèse avant de l’enregistrer.';
 }catch(error){$('confrontationTitle').textContent='Confrontation non effectuée';$('confrontationText').textContent=error.message||'Erreur pendant la confrontation Groq.';if(status)status.textContent=error.message||'Erreur Groq.';}
 finally{if(button)button.disabled=false;}
}
function restoreMyAnalysis(){
  try{const d=JSON.parse(localStorage.getItem('aurevia_my_analysis')||'null');if(d){$('myAnalysisInstrument').value=d.instrument||'XAUUSD';$('myAnalysisTf').value=d.timeframe||'M30';$('myAnalysisDirection').value=d.direction||'WAIT';$('myAnalysisEntry').value=d.entry||'';if($('myAnalysisZoneLow'))$('myAnalysisZoneLow').value=d.zoneLow||'';if($('myAnalysisZoneHigh'))$('myAnalysisZoneHigh').value=d.zoneHigh||'';if($('myAnalysisOrderType'))$('myAnalysisOrderType').value=d.orderType||'';$('myAnalysisSL').value=d.sl||'';$('myAnalysisTP').value=d.tp||'';$('myAnalysisStructure').value=d.structure||'';$('myAnalysisReason').value=d.reason||'';$('myAnalysisInvalidation').value=d.invalidation||'';$('myAnalysisStatus').textContent='Dernière analyse personnelle restaurée depuis cet appareil.';}}catch{}
  renderAnalysisHistory();
}

async function loadServiceStatus(){
  const labels={ai:['serviceGroq','Moteur IA Groq'],marketData:['serviceMarketData','Données Twelve Data'],supabase:['serviceSupabase','Supabase serveur'],telegram:['serviceTelegram','Notifications Telegram']};
  try{const token=await getAnalysisAccessToken();if(!token)throw new Error('Connexion requise.');const response=await fetch('/api/service-status',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});if(!response.ok)throw new Error('Statut serveur indisponible.');const data=await response.json();for(const [key,[id,label]] of Object.entries(labels)){const el=$(id);const configured=Boolean(data.services?.[key]?.configured);const text=`${label} : ${configured?'configuré côté serveur':'non configuré côté serveur'}`;if(el){el.textContent=text;el.dataset.state=configured?'ready':'missing';}const adminId={ai:'adminServiceGroq',marketData:'adminServiceMarketData',supabase:'adminServiceSupabase',telegram:'adminServiceTelegram'}[key];if($(adminId))$(adminId).textContent=text;}}
  catch{for(const [key,[id,label]] of Object.entries(labels)){const text=`${label} : statut indisponible (vérification au prochain accès)`;if($(id))$(id).textContent=text;const adminId={ai:'adminServiceGroq',marketData:'adminServiceMarketData',supabase:'adminServiceSupabase',telegram:'adminServiceTelegram'}[key];if($(adminId))$(adminId).textContent=text;}}
}


async function adminRequest(payload=null,query=''){
 const token=await getAnalysisAccessToken();if(!token)throw new Error('Connectez-vous pour continuer.');
 const response=await fetch('/api/admin'+query,{method:payload?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>({error:'Réponse serveur illisible.'}));
 if(!response.ok){const error=new Error(data.error||'Action administrateur impossible.');error.status=response.status;error.code=data.code||null;throw error;}
 return data;
}
function renderAdminUsers(users){
 const host=$('adminUsersRows');if(!host)return;
 host.innerHTML=(users||[]).length?users.map(u=>{
  const suspended=Boolean(u.banned_until&&new Date(u.banned_until)>new Date());
  const online=Boolean(u.online),active=Boolean(u.session_active);
  const lastSeen=u.last_seen?new Date(u.last_seen).toLocaleString():'—';
  const sessionLabel=active?'Session active':'Aucune session active';
  return `<tr><td>${escapeText(u.display_name||u.email||u.id)}<small>${escapeText(u.email||'')}</small></td><td>${u.created_at?new Date(u.created_at).toLocaleDateString():'—'}</td><td>${u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString():'Jamais'}</td><td>${escapeText(lastSeen)}${u.user_agent?`<small>${escapeText(u.user_agent.slice(0,90))}</small>`:''}</td><td><span class="admin-state ${online?'is-online':'is-offline'}">${online?'En ligne':'Hors ligne'}</span><small>${escapeText(sessionLabel)}</small></td><td>${u.role==='admin'?'Administrateur':'Utilisateur'}</td><td><div class="table-actions">${suspended?`<button class="small-btn" data-admin-action="activate" data-user="${u.id}">Réactiver</button>`:`<button class="small-btn" data-admin-action="suspend" data-user="${u.id}">Suspendre</button>`}${active?`<button class="small-btn" data-admin-action="revoke_session" data-user="${u.id}">Déconnecter</button>`:''}<button class="small-btn danger-btn" data-admin-action="delete_user" data-user="${u.id}" data-email="${escapeText(u.email||'')}">Supprimer</button></div></td></tr>`;
 }).join(''):'<tr><td colspan="7" class="empty-cell">Aucun compte correspondant.</td></tr>';
 host.querySelectorAll('[data-admin-action]').forEach(btn=>btn.addEventListener('click',async()=>{
  const action=btn.dataset.adminAction,user_id=btn.dataset.user,email=btn.dataset.email||'';
  const message=action==='delete_user'?`Supprimer définitivement le compte ${email||user_id} et ses données liées ? Cette action est irréversible.`:action==='revoke_session'?`Déconnecter à distance ${email||user_id} ? La session sera refusée lors du prochain contrôle.`:`Confirmer l’action « ${action} » pour ${email||user_id} ?`;
  if(!confirm(message))return;
  btn.disabled=true;
  try{await adminRequest({action,user_id});await loadAdminConsole(adminPage,adminSearchValue);}
  catch(error){alert(error.message);btn.disabled=false;}
 }));
}
function renderAdminAnnouncements(items){
 const host=$('adminAnnouncementsRows');if(!host)return;
 host.innerHTML=items?.length?items.map(a=>{
  const expired=Boolean(a.ends_at&&new Date(a.ends_at)<=new Date());
  const status=expired?'Expirée':a.is_published?'Publiée':'Brouillon';
  return `<tr><td>${escapeText(a.title)}</td><td>${escapeText(a.category)}</td><td>${status}</td><td>${a.ends_at?new Date(a.ends_at).toLocaleString():'Sans expiration'}</td><td><div class="table-actions"><button class="small-btn" data-announcement-toggle="${a.id}" data-published="${a.is_published?'true':'false'}">${a.is_published?'Dépublier':'Publier'}</button>${!expired?`<button class="small-btn" data-announcement-expire="${a.id}">Expirer</button>`:''}</div></td></tr>`;
 }).join(''):'<tr><td colspan="5" class="empty-cell">Aucune annonce.</td></tr>';
 host.querySelectorAll('[data-announcement-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{const result=await adminRequest({action:'announcement_publish',announcement_id:btn.dataset.announcementToggle,is_published:btn.dataset.published!=='true'});if(result.telegram?.status==='sent'||result.telegram?.status==='partial'||result.telegram?.status==='failed'){const status=$('adminAnnouncementStatus');if(status)status.textContent=`Diffusion Telegram : ${result.telegram.sent||0} envoyé(s), ${result.telegram.failed||0} échec(s).`;}await loadAdminConsole(adminPage,adminSearchValue);}catch(error){alert(error.message);btn.disabled=false;}}));
 host.querySelectorAll('[data-announcement-expire]').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('Expirer immédiatement cette annonce globale ?'))return;btn.disabled=true;try{await adminRequest({action:'announcement_expire',announcement_id:btn.dataset.announcementExpire});await loadAdminConsole(adminPage,adminSearchValue);}catch(error){alert(error.message);btn.disabled=false;}}));
}
function renderAdminAudit(items){const host=$('adminAuditRows');if(!host)return;host.innerHTML=items?.length?items.map(a=>`<tr><td>${a.created_at?new Date(a.created_at).toLocaleString():'—'}</td><td>${escapeText(a.action)}</td><td>${escapeText(a.actor_id||'—')}</td><td>${escapeText(a.target_user_id||'—')}</td><td>${escapeText(JSON.stringify(a.details||{}))}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">Aucune action enregistrée.</td></tr>';}
let adminUsersCache=[],adminPage=1,adminHasMore=false,adminSearchValue='',adminSearchTimer=null;
const adminSelectedAnnouncementRecipients=new Map();
function renderAnnouncementRecipientPicker(){
 const audience=$('adminAnnouncementAudience'),wrap=$('adminAnnouncementRecipientsWrap'),picker=$('adminAnnouncementRecipients'),help=$('adminAnnouncementRecipientsHelp');
 if(!audience||!wrap||!picker)return;
 const targeted=audience.value==='selected';wrap.hidden=!targeted;
 if(!targeted){picker.disabled=true;if(help)help.textContent='L’annonce sera visible par tous les utilisateurs.';return;}
 picker.disabled=false;
 const current=new Map((adminUsersCache||[]).map(user=>[String(user.id),user]));
 picker.innerHTML=[...current.entries()].map(([id,user])=>`<option value="${escapeText(id)}">${escapeText(user.display_name||user.email||id)}${user.email&&user.display_name?` · ${escapeText(user.email)}`:''}</option>`).join('');
 for(const option of picker.options)option.selected=adminSelectedAnnouncementRecipients.has(option.value);
 if(help)help.textContent=`${adminSelectedAnnouncementRecipients.size} destinataire(s) sélectionné(s) · ${adminUsersCache.length} compte(s) affiché(s). Utilisez la recherche ou la pagination des comptes pour ajouter d’autres utilisateurs. Maximum : 100.`;
}
async function loadAdminConsole(page=adminPage,search=adminSearchValue){
 try{
  adminPage=Math.max(1,page);adminSearchValue=String(search||'').trim();
  const query=new URLSearchParams({page:String(adminPage)});if(adminSearchValue)query.set('q',adminSearchValue);
  const data=await adminRequest(null,`?${query.toString()}`);
  adminHasMore=Boolean(data.pagination?.has_more);$('adminUsersPage').textContent=`Page ${adminPage} · ${data.pagination?.total??0} compte(s)`;$('adminUsersPrev').disabled=adminPage<=1;$('adminUsersNext').disabled=!adminHasMore;
  $('adminUnlocked')?.removeAttribute('hidden');$('adminUsersPanel')?.removeAttribute('hidden');$('adminAnnouncementsPanel')?.removeAttribute('hidden');$('adminAuditPanel')?.removeAttribute('hidden');
  const stats=data.stats||{};$('adminStatProfiles').textContent=stats.profiles??'—';$('adminStatOnline').textContent=stats.users_online??'—';$('adminStatSessions').textContent=stats.active_sessions??'—';$('adminStatSuspended').textContent=stats.suspended??'—';$('adminStatTrades').textContent=stats.trading_journal??'—';$('adminStatPositions').textContent=stats.trading_position_groups??'—';$('adminStatTelegram').textContent=stats.telegram_connections??'—';
  adminUsersCache=data.users||[];renderAdminUsers(adminUsersCache);renderAnnouncementRecipientPicker();renderAdminAnnouncements(data.announcements||[]);renderAdminAudit(data.auditLog||[]);loadServiceStatus();
 }catch(error){
  $('adminUnlocked')?.setAttribute('hidden','');$('adminUsersPanel')?.setAttribute('hidden','');$('adminAnnouncementsPanel')?.setAttribute('hidden','');$('adminAuditPanel')?.setAttribute('hidden','');
  if(error.status===403||error.status===409){window.__aureviaAdminVerified=false;document.querySelector('[data-page="admin"]')?.setAttribute('hidden','');$('page-admin')?.setAttribute('hidden','');if(location.hash==='#admin')history.replaceState(null,'','#accueil');}
  if($('adminUsersNote'))$('adminUsersNote').textContent=error.message;
 }
}

function readPositionContractSpec(){
  return {
    accountCurrency:accountCurrency||'', leverage:$('posLeverage').value.trim()?Number($('posLeverage').value):null,
    calculationType:$('posCalculationType').value, contractSize:$('posContract').value.trim()?Number($('posContract').value):null,
    quoteToAccount:1,
    pointSize:$('posPointSize').value.trim()?Number($('posPointSize').value):null, pointValue:$('posPointValue').value.trim()?Number($('posPointValue').value):null,
    tickSize:$('posTickSize').value.trim()?Number($('posTickSize').value):null, tickValue:$('posTickValue').value.trim()?Number($('posTickValue').value):null,
    minLot:Number($('posMinLot').value), lotStep:Number($('posLotStep').value), maxLot:$('posMaxLot').value.trim()?Number($('posMaxLot').value):null,
    feesPerLot:Number($('posFees').value||0), marginPerLot:$('posMarginPerLot').value.trim()?Number($('posMarginPerLot').value):null
  };
}
function updatePositionCalculationFields(){
  const type=$('posCalculationType')?.value||'contract';
  document.querySelectorAll('[data-contract-field]').forEach(field=>{field.hidden=field.dataset.contractField!==type;});
}
function bindPositionContractFields(){ $('posCalculationType')?.addEventListener('change',updatePositionCalculationFields);updatePositionCalculationFields(); }

async function refreshTelegramHomeNotice(){
  const notice=$('telegramHomeNotice');if(!notice)return;
  if(!window.__aureviaAuthenticated){notice.hidden=true;return;}
  try{
    const prefs=await loadTelegramPreferences();
    notice.hidden=Boolean(prefs?.chat_id);
    notice.dataset.state=prefs?.chat_id?'connected':'disconnected';
  }catch(error){
    notice.hidden=false;notice.dataset.state='unknown';
    const copy=notice.querySelector('.telegram-home-copy p');
    if(copy)copy.textContent='La liaison Telegram n’a pas pu être vérifiée. Ouvrez cette section pour vérifier votre connexion et activer les notifications.';
  }
}
async function loadTelegramUi(){try{const prefs=await loadTelegramPreferences();const status=$('telegramConnectionStatus');if(!prefs){status.textContent='Connectez-vous dans Paramètres & profil pour associer Telegram.';$('saveTelegramPrefs').disabled=true;$('sendTelegramTest').disabled=true;return;}status.textContent=prefs.chat_id?'Compte Telegram associé.':'Compte Telegram non associé.';$('unlinkTelegramAccount').disabled=!prefs.chat_id;$('notifyAll').checked=Boolean(prefs.notify_all_analyses);$('notifySignals').checked=Boolean(prefs.notify_validated_signals);$('notifyEconomic').checked=Boolean(prefs.notify_economic_announcements);$('notifyProductAnnouncements').checked=Boolean(prefs.notify_product_announcements);$('saveTelegramPrefs').disabled=!prefs.chat_id;$('sendTelegramTest').disabled=!prefs.chat_id;}catch(error){$('telegramConnectionStatus').textContent=error.message;}}
function renderJournalStats(){
  const manual=loadJournalTrades(),linked=loadLinkedJournal();
  const closedLinked=linked.filter(x=>x.status==='CLOSED');
  const wins=manual.filter(x=>Number(x.result)>0).length+closedLinked.filter(x=>Number(x.realizedPnl)>0).length;
  const losses=manual.filter(x=>Number(x.result)<0).length+closedLinked.filter(x=>Number(x.realizedPnl)<0).length;
  const closedCount=manual.length+closedLinked.length;
  const totalCount=manual.length+linked.length;
  const net=manual.reduce((sum,x)=>sum+Number(x.result||0),0)+linked.reduce((sum,x)=>sum+Number(x.realizedPnl||0),0);
  $('journalCount').textContent=totalCount;$('journalWins').textContent=wins;$('journalLosses').textContent=losses;$('journalWinRate').textContent=closedCount?`${(wins/closedCount*100).toFixed(1)} %`:'—';$('journalNet').textContent=net.toFixed(2);
}

function renderLinkedJournal(){const host=$('linkedJournalRows');if(!host)return;const rows=loadLinkedJournal();host.innerHTML=rows.length?rows.map(r=>`<tr><td>${escapeText(r.instrument)}</td><td>${r.mode==='unique'?'Position unique':'Trades séparés'}</td><td>${r.direction}</td><td>${escapeText(r.tpLabel||`${r.childIds?.length||0} TP`)}${r.lot?` · ${Number(r.lot).toFixed(2)} lot` : ''}</td><td>${Number(r.realizedPnl||0).toFixed(2)}</td><td>${r.status==='PENDING'?'EN ATTENTE':r.status==='OPEN'?'OUVERTE':'CLÔTURÉE'}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">Aucune fiche liée.</td></tr>';renderJournalStats(); }
function renderPositions(){
  const host=$('positionRows');if(!host)return;
  const groups=loadTradeGroups();$('positionCount').textContent=`${groups.length} groupe(s)`;
  const rows=groups.flatMap(g=>g.children.map(c=>({g,c})));
  host.innerHTML=rows.length?rows.map(({g,c})=>`<tr><td>${escapeText(g.instrument)}</td><td>${g.mode==='unique'?'Position unique':'Trades séparés'}</td><td>${c.direction}</td><td>${escapeText(c.tpLabel)} · ${Number(c.takeProfit)}</td><td>${Number(c.initialLot).toFixed(2)}</td><td>${Number(c.remainingLot).toFixed(2)}</td><td class="${c.realizedPnl>=0?'good':'bad'}">${Number(c.realizedPnl).toFixed(2)} ${escapeText(g.contractSpec?.accountCurrency||'')}</td><td>${c.status==='PENDING'?'EN ATTENTE':c.status==='OPEN'?'OUVERTE':'CLÔTURÉE'}</td><td>${c.status==='OPEN'?`<button class="small-btn" data-close-child="${c.id}">Clôturer</button>${g.children.at(-1)?.id===c.id&&!g.children.some(x=>(x.closes||[]).length)?` <button class="small-btn" data-edit-group="${g.id}">Modifier</button>`:''}`:(g.status==='CLOSED'&&g.children.at(-1)?.id===c.id?`<button class="small-btn" data-delete-closed-group="${g.id}">Supprimer</button>`:'—')}</td></tr>`).join(''):'<tr><td colspan="9" class="empty-cell">Aucune position enregistrée.</td></tr>';
  renderLinkedJournal();
  host.querySelectorAll('[data-edit-group]').forEach(btn=>btn.addEventListener('click',()=>{const group=groups.find(g=>g.id===btn.dataset.editGroup);if(!group)return;$('editGroupId').value=group.id;$('editEntry').value=group.children[0].entry;$('editSL').value=group.children[0].stopLoss;[1,2,3].forEach(i=>{const child=group.children[i-1],wrap=$(`editTP${i}Wrap`);if(wrap)wrap.hidden=!child;if(child)$(`editTP${i}`).value=child.takeProfit;});$('editPositionDialog').showModal();}));
  host.querySelectorAll('[data-delete-closed-group]').forEach(btn=>btn.addEventListener('click',async()=>{const groupId=btn.dataset.deleteClosedGroup;if(!confirm('Supprimer définitivement cette position clôturée et sa fiche liée au journal ?'))return;try{const cloud=await deleteClosedTradeGroupFromSupabase(groupId);if(!cloud.synced&&cloud.reason!=='not_found')throw new Error('Connectez-vous pour confirmer la suppression côté cloud.');}catch(error){alert(`Suppression cloud impossible : ${error.message}`);return;}try{deleteClosedTradeGroup(groupId);renderPositions();renderJournal();}catch(error){alert(error.message);}}));
  host.querySelectorAll('[data-close-child]').forEach(btn=>btn.addEventListener('click',()=>{const childId=btn.dataset.closeChild,group=groups.find(g=>g.children.some(c=>c.id===childId)),child=group?.children.find(c=>c.id===childId);$('closeChildId').value=childId;$('closeVolume').value='';$('closeVolume').step=String(group?.lotStep||0.01);$('closeVolume').min=String(group?.lotStep||0.01);$('closeVolume').max=String(child?.remainingLot||'');$('closeExit').value='';$('closeFees').value='';$('closePositionDialog').showModal();}));
}
function mountStandaloneDxy(){const host=$('dxyStandalone');if(!host||host.dataset.loaded)return;host.dataset.loaded='1';const frame=document.createElement('iframe');frame.title='Graphique DXY sur TradingView';frame.loading='lazy';frame.referrerPolicy='no-referrer-when-downgrade';frame.style.width='100%';frame.style.height='420px';frame.style.border='0';frame.src='https://s.tradingview.com/widgetembed/?frameElementId=dxy_standalone&symbol=TVC%3ADXY&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=0b1222&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&locale=fr';host.replaceChildren(frame);}
function createPositionFromForm(){
  const tps=[1,2,3].map(i=>({label:`TP${i}`,price:Number($(`posTP${i}`).value)})).filter(x=>Number.isFinite(x.price)&&x.price>0);
  try{
    if(!accountCurrency)throw new Error('Renseignez d’abord la devise de votre compte dans Paramètres → Devise du compte.');const contractSpec=readPositionContractSpec();contractSpec.quoteCurrency=inferQuoteCurrency($('posInstrument').value);const checked=validateContractSpec(contractSpec);if(!checked.ok)throw new Error(checked.error);const enteredLot=Number($('posLot').value);if(enteredLot<checked.spec.minLot||(checked.spec.maxLot!==null&&enteredLot>checked.spec.maxLot))throw new Error(`Le lot doit être compris entre ${checked.spec.minLot} et ${checked.spec.maxLot??'sans maximum défini'} pour ${$('posInstrument').value}.`);const group=createTradeGroup({mode:$('posMode').value,instrument:$('posInstrument').value,direction:$('posDirection').value,lot:enteredLot,lotStep:checked.spec.lotStep,entry:Number($('posEntry').value),stopLoss:Number($('posSL').value),takeProfits:tps,autoJournal:$('posAutoJournal').checked,orderType:$('posOrderType').value,triggerPrice:$('posTrigger').value.trim()?Number($('posTrigger').value):null,limitPrice:$('posLimit').value.trim()?Number($('posLimit').value):null,expiresAt:$('posExpiry').value?new Date($('posExpiry').value).toISOString():null,contractSpec:checked.spec,brokerSnapshot:{brokerName:checked.spec.brokerName,accountType:checked.spec.accountType,accountCurrency:checked.spec.accountCurrency,leverage:checked.spec.leverage}});
    saveTradeGroup(group);renderPositions();const tradeLines=[`AUREVIA COPILOT · TRADE ENREGISTRÉ`,`Instrument : ${group.instrument}`,`Direction : ${group.direction}`,`Type : ${group.orderType}`,`Entrée : ${group.children[0].entry}`,`Stop Loss : ${group.children[0].stopLoss}`,`Take Profits : ${group.children.map(c=>`${c.tpLabel} ${c.takeProfit} (${c.initialLot} lot)`).join(' · ')}`,`Volume total : ${group.requestedLot}`,`Suivi interne AUREVIA uniquement · aucun ordre broker envoyé.`];sendTelegramNotification({type:'trade_open',text:tradeLines.join('\n')}).catch(()=>{});syncTradeGroupToSupabase(group).then(r=>{if(r.synced)alert(`Position enregistrée et synchronisée : ${group.children.length} trade(s).`);else alert(`Position enregistrée sur cet appareil : connectez-vous à Supabase pour la synchroniser. ${group.autoJournal?'Fiche locale liée au journal créée.':'Journal automatique désactivé.'}`);}).catch(error=>alert(`Position conservée localement, mais synchronisation cloud impossible : ${error.message}`));
  }catch(error){alert(error.message);}
}
async function savePartialCloseFromForm(){
  try{
    const childId=$('closeChildId').value;const groups=loadTradeGroups();const group=groups.find(g=>g.children.some(c=>c.id===childId));if(!group)throw new Error('Position introuvable.');
    const fees=$('closeFees').value.trim()===''?null:Number($('closeFees').value);
    let closeSpec=group.contractSpec?{...group.contractSpec}:null;let fxSnapshot=null;if(closeSpec?.calculationType==='contract'){const quoteCurrency=closeSpec.quoteCurrency||inferQuoteCurrency(group.instrument);if(!quoteCurrency)throw new Error(`Devise de cotation inconnue pour ${group.instrument}. Impossible de calculer le résultat sans conversion fiable.`);const token=await getAnalysisAccessToken();if(!token)throw new Error('Session expirée : reconnectez-vous pour récupérer le taux de conversion.');const response=await fetch(`/api/fx-rate?from=${encodeURIComponent(quoteCurrency)}&to=${encodeURIComponent(closeSpec.accountCurrency)}`,{headers:{authorization:`Bearer ${token}`}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Taux de conversion indisponible.');fxSnapshot=validateFxSnapshot(data,{from:quoteCurrency,to:closeSpec.accountCurrency});closeSpec={...closeSpec,quoteCurrency,quoteToAccount:fxSnapshot.rate,fxSnapshot};}
    recordPartialClose(group,childId,{volume:Number($('closeVolume').value),exit:Number($('closeExit').value),contractSpec:closeSpec,contractSize:group.contractSize,quoteToAccount:closeSpec?.quoteToAccount??group.quoteToAccount,feesPerLot:group.feesPerLot,fees,fxSnapshot});
    const child=group.children.find(x=>x.id===childId),closeEvent=child.closes.at(-1);persistTradeGroup(group);sendTelegramNotification({type:'trade_close',text:`AUREVIA COPILOT · CLÔTURE ENREGISTRÉE\n${group.instrument} · ${child.direction} · ${child.tpLabel}\nVolume clôturé : ${closeEvent.volume}\nPrix de sortie saisi : ${closeEvent.exit}\nRésultat net enregistré : ${closeEvent.net.toFixed(2)}\nVolume restant : ${child.remainingLot}\nClôture interne AUREVIA uniquement.`}).catch(()=>{});$('closePositionDialog').close();renderPositions();renderJournal();renderLinkedJournal();syncTradeCloseToSupabase(group,child,closeEvent).catch(error=>alert(`Clôture enregistrée localement, mais synchronisation cloud impossible : ${error.message}`));
  }catch(error){alert(error.message);}
}
let announcementCache=[],announcementFilter='all';
function updateAnnouncementBadge(){const badge=$('announcementUnreadBadge');if(!badge)return;const count=announcementCache.filter(a=>!a.is_read).length;badge.textContent=count>99?'99+':String(count);badge.hidden=count===0;}
function renderAnnouncements(){const host=$('announcementList');if(!host)return;const items=announcementCache.filter(a=>announcementFilter==='all'||!a.is_read);updateAnnouncementBadge();document.querySelectorAll('[data-announcement-filter]').forEach(b=>b.classList.toggle('active',b.dataset.announcementFilter===announcementFilter));if(!items.length){host.innerHTML=`<div class="empty-cell">${announcementFilter==='unread'?'Aucune annonce non lue.':'Aucune annonce publiée pour le moment.'}</div>`;return;}const now=Date.now();host.innerHTML=items.map(a=>{const expired=a.ends_at&&Date.parse(a.ends_at)<now;const date=a.created_at?new Date(a.created_at).toLocaleString('fr-FR'):'Date inconnue';const url=typeof a.source_url==='string'&&/^https:\/\//i.test(a.source_url)?a.source_url:null;return `<article class="announcement-card ${a.is_read?'is-read':'is-unread'}"><div class="announcement-card-top"><span class="announcement-category">${escapeText(a.category||'Information')}</span><span class="announcement-state">${a.is_read?'Lue':'Non lue'}${expired?' · Archivée':''}</span></div><h3>${escapeText(a.title)}</h3><p>${escapeText(a.body).replace(/\n/g,'<br>')}</p><div class="announcement-meta"><span>${escapeText(date)}</span>${expired?'<span>Annonce expirée · conservée dans l’historique</span>':''}</div><div class="announcement-actions">${url?`<a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer">Consulter la source</a>`:''}${!a.is_read?`<button class="small-btn" type="button" data-announcement-read="${escapeText(a.id)}">Marquer comme lue</button>`:''}</div></article>`;}).join('');host.querySelectorAll('[data-announcement-read]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await markAnnouncementAsRead(btn.dataset.announcementRead);const item=announcementCache.find(a=>a.id===btn.dataset.announcementRead);if(item){item.is_read=true;item.read_at=new Date().toISOString();}renderAnnouncements();}catch(error){$('announcementStatus').textContent='Lecture non synchronisée : '+error.message;btn.disabled=false;}}));}
async function loadAnnouncements(){if(!window.__aureviaAuthenticated)return;const status=$('announcementStatus');if(status)status.textContent='Actualisation des annonces…';try{announcementCache=await loadPublishedAnnouncements();renderAnnouncements();if(status)status.textContent=`${announcementCache.length} annonce(s) publiée(s) · ${announcementCache.filter(a=>!a.is_read).length} non lue(s).`;}catch(error){if(status)status.textContent='Impossible de charger les annonces : '+error.message;const host=$('announcementList');if(host)host.innerHTML='<div class="empty-cell">Les annonces ne sont pas disponibles. Réessayez après vérification de votre connexion.</div>';}}
async function refreshAccountCurrency(){
 const notice=$('accountCurrencyNotice'),status=$('accountCurrencyStatus'),select=$('profileAccountCurrency'),risk=$('accountCurrency');
 try{accountCurrency=await loadAccountCurrency();if(select)select.value=accountCurrency||'';if(risk)risk.value=accountCurrency||'À configurer dans Paramètres';if(notice)notice.hidden=Boolean(accountCurrency);if(status)status.textContent=accountCurrency?`Devise enregistrée : ${accountCurrency}. Elle sera utilisée automatiquement.`:'Aucune devise enregistrée. Choisissez-la puis enregistrez.';return accountCurrency;}
 catch(error){if(status)status.textContent='Impossible de charger la devise : '+error.message;return null;}
}
async function persistAccountCurrency(){const button=$('saveAccountCurrency');try{if(button)button.disabled=true;const value=await saveAccountCurrency($('profileAccountCurrency').value);accountCurrency=value;if($('accountCurrency').value!==undefined)$('accountCurrency').value=value;if($('accountCurrencyNotice'))$('accountCurrencyNotice').hidden=true;if($('accountCurrencyStatus'))$('accountCurrencyStatus').textContent=`Devise enregistrée : ${value}.`;alert(`Devise du compte enregistrée : ${value}.`);}catch(error){if($('accountCurrencyStatus'))$('accountCurrencyStatus').textContent=error.message;alert(error.message);}finally{if(button)button.disabled=false;}}
function bindEvents(){
  let pendingAdminRoute=false;
  $('saveAccountCurrency')?.addEventListener('click',persistAccountCurrency);
  window.addEventListener('aurevia:authchange',async event=>{if(!window.__aureviaAuthenticated)return;bootAuthenticatedApp();refreshAccountCurrency();refreshTelegramHomeNotice();loadAnalysis();loadAnnouncements();if(event.detail?.event==='SIGNED_IN'||event.detail?.event==='INITIAL_SESSION'){try{const restored=await restoreTradeGroupsFromSupabase();if(restored.restored){mergeRestoredTradeGroups(restored.groups,restored.journal);renderPositions();renderLinkedJournal();}}catch(error){console.warn('Restauration cloud AUREVIA indisponible :',error.message);}}});
  window.addEventListener('aurevia:adminchange',event=>{
    const allowed=event.detail?.isAdmin===true;window.__aureviaAdminVerified=allowed;
    const announcementsLink=document.querySelector('[data-page="annonces"]');
    if(announcementsLink)announcementsLink.hidden=false;
    const announcementsView=$('page-annonces');
    if(announcementsView)announcementsView.hidden=false;
    if(allowed)loadAnnouncements();
    if(allowed&&pendingAdminRoute){pendingAdminRoute=false;showPage('admin');}
    else if(!allowed){pendingAdminRoute=false;if(location.hash==='#admin')showPage('accueil');}
    else if(allowed&&location.hash==='#admin')loadAdminConsole();
  });
  $('instrumentSelect').addEventListener('change',e=>setSelectedSymbol(e.target.value));
  $('analysisInstrumentSelect')?.addEventListener('change',e=>setSelectedSymbol(e.target.value));
  document.querySelectorAll('.ticker').forEach(t=>t.addEventListener('click',()=>{document.querySelector('[data-page="marches"]')?.click();setSelectedSymbol(t.dataset.symbol);}));
  document.querySelectorAll('#timeframes button').forEach(b=>b.addEventListener('click',()=>setTimeframe(b.dataset.tf)));
  $('refreshBtn').addEventListener('click',()=>{mountTradingView();loadAnalysis();});
  $('analyzeBtn')?.addEventListener('click',()=>loadAnalysis());
  $('menuToggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
  const showPage = requestedPage => {
    let page=requestedPage;
    if(page==='admin'&&window.__aureviaAdminVerified!==true){if(window.__aureviaAdminVerified===null)pendingAdminRoute=true;page='accueil';}
    document.querySelectorAll('[data-page-view]').forEach(v=>v.classList.toggle('active',v.dataset.pageView===page));
    document.querySelectorAll('[data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===page));
    $('sidebar').classList.remove('open');
    if(page==='marches'){mountTradingView();mountDxyChart();mountTickerTape();}
    if(page==='positions')renderPositions();
    if(page==='dxy')mountStandaloneDxy();
    if(page==='telegram'){loadTelegramUi();refreshTelegramHomeNotice();}
    if(page==='parametres')loadServiceStatus();
    if(page==='admin')loadAdminConsole(1);
    if(page==='annonces')loadAnnouncements();
    history.replaceState(null,'','#'+page);
    window.scrollTo({top:0,behavior:'smooth'});
  };
  document.querySelectorAll('[data-page]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showPage(a.dataset.page);}));
  const initial=location.hash.replace('#','');
  if(document.querySelector(`[data-page-view="${initial}"]`))showPage(initial);
  window.addEventListener('hashchange',()=>{
    const requested=location.hash.replace('#','');
    if(document.querySelector(`[data-page-view="${requested}"]`))showPage(requested);
  });

  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`[data-page="${b.dataset.goto}"]`)?.click()));
  document.querySelectorAll('.home-asset').forEach(b=>b.addEventListener('click',()=>{document.querySelector('[data-page="marches"]')?.click();setSelectedSymbol(b.dataset.symbol);}));
  $('calculateRisk').addEventListener('click',()=>{
    if(!accountCurrency){$('riskResult').textContent='Renseignez la devise du compte dans Paramètres avant de calculer.';return;}
    const entry=Number($('entryPrice').value),stop=Number($('stopPrice').value),tp=Number($('takeProfit').value);
    const enteredDistance=Number($('slDistance').value);const distance=enteredDistance>0?enteredDistance:(entry>0&&stop>0?Math.abs(entry-stop):NaN);
    const reward=entry>0&&tp>0?Math.abs(tp-entry):null;
    const result=calculatePositionRisk({balance:Number($('accountBalance').value),riskAmount:Number($('riskAmount').value),stopDistance:distance,unitValuePerLot:Number($('unitValue').value),lotStep:Number($('lotStep').value),rewardDistance:reward,marginPerLot:$('marginPerLot').value.trim()?Number($('marginPerLot').value):null});
    $('riskResult').textContent=result.error||`Calcul estimatif pour ${$('riskInstrument').value} · ${result.lots.toFixed(2)} lot(s) · risque réellement engagé : ${result.riskMoney.toFixed(2)} ${$('accountCurrency').value}`;
    $('riskMoneyOut').textContent=result.error?'—':`${result.riskMoney.toFixed(2)} ${$('accountCurrency').value}`;$('lotsOut').textContent=result.error?'—':result.lots.toFixed(2);$('lossOut').textContent=result.error?'—':`${result.riskMoney.toFixed(2)} ${$('accountCurrency').value}`;$('gainOut').textContent=result.error||result.gain===null?'—':`${result.gain.toFixed(2)} ${$('accountCurrency').value}`;$('rrOut').textContent=result.error||result.rr===null?'—':`1:${result.rr.toFixed(2)}`;$('riskPctOut').textContent=result.error||result.riskPercentActual===null?'—':`${result.riskPercentActual.toFixed(2)} %`;$('marginOut').textContent=result.error||result.margin===null?'—':`${result.margin.toFixed(2)} ${$('accountCurrency').value}`;
  });
  $('savePositionEdit')?.addEventListener('click',async()=>{try{const group=loadTradeGroups().find(g=>g.id===$('editGroupId').value);if(!group)throw new Error('Position introuvable.');const tps=group.children.map((_,i)=>Number($(`editTP${i+1}`).value));editOpenTradeGroup(group,{entry:Number($('editEntry').value),stopLoss:Number($('editSL').value),takeProfits:tps});persistTradeGroup(group);$('editPositionDialog').close();renderPositions();try{const result=await syncTradeGroupToSupabase(group);if(!result.synced)alert('Modification enregistrée localement ; connectez-vous pour la synchroniser.');}catch(error){alert(`Modification locale enregistrée, mais synchronisation cloud impossible : ${error.message}`);}}catch(error){alert(error.message);}});
  $('addTradeBtn').addEventListener('click',()=>{const dialog=$('tradeDialog');$('tradeForm').reset();if(!dialog.open)dialog.showModal();});
  $('closeTradeDialog')?.addEventListener('click',()=>{$('tradeDialog').close('cancel');});
  $('tradeDialog')?.addEventListener('click',event=>{if(event.target===$('tradeDialog'))$('tradeDialog').close('cancel');});
  $('tradeDialog')?.addEventListener('cancel',()=>{$('tradeForm').reset();});
  $('tradeDialog')?.addEventListener('close',()=>{$('tradeForm').reset();});
  $('journalRows')?.addEventListener('click',event=>{const btn=event.target.closest('[data-delete-journal]');if(!btn)return;if(!confirm('Supprimer définitivement cette entrée du journal local ?'))return;const result=deleteJournalTrade(btn.dataset.deleteJournal);if(!result.ok){alert(result.error);return;}renderJournal();renderJournalStats();});
  $('saveTrade').addEventListener('click',()=>{
    const result=addJournalTrade({instrument:$('tradeInstrument').value,direction:$('tradeDirection').value,result:Number($('tradeResult').value),date:$('tradeDate').value,note:$('tradeNote').value});
    if(result.ok){sendTelegramNotification({type:'trade_close',text:`AUREVIA COPILOT · TRADE AJOUTÉ AU JOURNAL\n${$('tradeInstrument').value} · ${$('tradeDirection').value}\nRésultat net : ${Number($('tradeResult').value).toFixed(2)}\nDate : ${$('tradeDate').value}\nNote : ${$('tradeNote').value||'—'}`}).catch(()=>{});renderJournal();renderJournalStats();$('tradeDialog').close();$('tradeForm').reset();}else alert(result.error);
  });
  $('settingsBtn').addEventListener('click',()=>document.querySelector('[data-page="parametres"]')?.click());
  document.querySelectorAll('[data-announcement-filter]').forEach(btn=>btn.addEventListener('click',()=>{announcementFilter=btn.dataset.announcementFilter;renderAnnouncements();}));
  $('announcementMarkAllRead')?.addEventListener('click',async event=>{
    const btn=event.currentTarget;
    const status=$('announcementStatus');
    if(btn.disabled)return;
    btn.disabled=true;
    const originalLabel=btn.textContent;
    btn.textContent='Synchronisation…';
    if(status)status.textContent='Mise à jour de vos lectures…';
    try{
      const latest=await loadPublishedAnnouncements();
      announcementCache=latest;
      const unread=latest.filter(item=>!item.is_read&&item.id);
      if(!unread.length){
        renderAnnouncements();
        if(status)status.textContent='Toutes les annonces sont déjà marquées comme lues.';
        return;
      }
      const result=await markAllAnnouncementsAsRead(unread.map(item=>item.id));
      if(!result?.success)throw new Error('Le serveur n’a pas confirmé la mise à jour.');
      const verified=await loadPublishedAnnouncements();
      announcementCache=verified;
      const remaining=verified.filter(item=>!item.is_read).length;
      renderAnnouncements();
      if(status)status.textContent=remaining===0
        ? `${unread.length} annonce(s) marquée(s) comme lue(s).`
        : `Mise à jour partielle : ${remaining} annonce(s) restent non lues.`;
    }catch(error){
      if(status)status.textContent='Échec du marquage comme lu : '+(error?.message||'Erreur inconnue')+'. Actualisez la page ou reconnectez-vous.';
      console.error('AUREVIA mark-all-announcements-read:',error);
    }finally{
      btn.disabled=false;
      btn.textContent=originalLabel;
    }
  });
  $('adminRefreshStatus')?.addEventListener('click',()=>loadAdminConsole(adminPage,adminSearchValue));
  $('adminAnnouncementAudience')?.addEventListener('change',renderAnnouncementRecipientPicker);
  $('adminAnnouncementRecipients')?.addEventListener('change',event=>{
    for(const option of event.target.options){
      if(option.selected)adminSelectedAnnouncementRecipients.set(option.value,option.textContent);
      else adminSelectedAnnouncementRecipients.delete(option.value);
    }
    if(adminSelectedAnnouncementRecipients.size>100){
      const selected=[...event.target.selectedOptions].map(option=>option.value),last=selected[selected.length-1];
      adminSelectedAnnouncementRecipients.delete(last);const option=[...event.target.options].find(item=>item.value===last);if(option)option.selected=false;
      $('adminAnnouncementStatus').textContent='Limite de 100 destinataires par annonce. Le dernier choix a été retiré.';
    }
    renderAnnouncementRecipientPicker();
  });
  $('adminUsersPrev')?.addEventListener('click',()=>loadAdminConsole(adminPage-1,adminSearchValue));
  $('adminUsersNext')?.addEventListener('click',()=>loadAdminConsole(adminPage+1,adminSearchValue));
  $('adminUserSearch')?.addEventListener('input',()=>{clearTimeout(adminSearchTimer);adminSearchTimer=setTimeout(()=>loadAdminConsole(1,$('adminUserSearch').value),350);});
  $('adminCheckTelegramBot')?.addEventListener('click',async()=>{
    const button=$('adminCheckTelegramBot'),status=$('adminTelegramBotCheckStatus');button.disabled=true;status.textContent='Interrogation sécurisée de Telegram…';
    try{const result=await adminRequest({action:'telegram_bot_check'});if(result.valid&&result.webhook?.configured){status.textContent=`Token valide · Bot : ${result.bot.first_name}${result.bot.username?' (@'+result.bot.username+')':''} · Webhook configuré${result.webhook.last_error?' · Dernière erreur Telegram : '+result.webhook.last_error:''}`;status.dataset.state='ready';}else if(result.valid){status.textContent=`Token valide, mais liaison entrante non prête : ${result.message||'Webhook non configuré.'}`;status.dataset.state='error';}else{status.textContent=result.message||'Telegram n’a pas validé le token.';status.dataset.state='error';}}
    catch(error){status.textContent='Contrôle impossible : '+error.message;status.dataset.state='error';}
    finally{button.disabled=false;}
  });
  $('adminCreateAnnouncement')?.addEventListener('click',async()=>{
    const status=$('adminAnnouncementStatus');status.textContent='Enregistrement…';
    try{
      const endsValue=$('adminAnnouncementEndsAt').value,audience=$('adminAnnouncementAudience')?.value||'all';
      const recipientIds=audience==='selected'?[...adminSelectedAnnouncementRecipients.keys()]:[];
      if(audience==='selected'&&!recipientIds.length)throw new Error('Sélectionnez au moins un destinataire pour une annonce ciblée.');
      if(recipientIds.length>100)throw new Error('Une annonce ciblée est limitée à 100 destinataires.');
      const result=await adminRequest({action:'announcement_create',title:$('adminAnnouncementTitle').value,body:$('adminAnnouncementBody').value,category:$('adminAnnouncementCategory').value,source_url:$('adminAnnouncementUrl').value||null,ends_at:endsValue?new Date(endsValue).toISOString():null,is_published:$('adminAnnouncementPublish').checked,audience,recipient_ids:recipientIds});
      $('adminAnnouncementTitle').value='';$('adminAnnouncementBody').value='';$('adminAnnouncementEndsAt').value='';adminSelectedAnnouncementRecipients.clear();renderAnnouncementRecipientPicker();status.textContent=`Annonce ${audience==='selected'?'ciblée · '+(result.recipient_count||recipientIds.length)+' destinataire(s)':'générale · tous les utilisateurs'} enregistrée.`+(result.telegram?.status==='sent'||result.telegram?.status==='partial'||result.telegram?.status==='failed'?` Telegram : ${result.telegram.sent||0} envoyé(s), ${result.telegram.failed||0} échec(s).`:'');await loadAdminConsole(adminPage,adminSearchValue);
    }catch(error){status.textContent=error.message;}
  });
  window.addEventListener('aurevia:adminchange',e=>{if(e.detail?.isAdmin)loadAdminConsole(1,adminSearchValue);});
  $('refreshScenarioWatch')?.addEventListener('click',refreshScenarioWatchList);
  $('saveMyAnalysis').addEventListener('click',saveMyAnalysis);
  $('saveFinalScenario')?.addEventListener('click',()=>saveScenarioFromUi('synthesis'));
  $('saveAiScenarioDirect')?.addEventListener('click',()=>saveScenarioFromUi('ai'));
  $('scenarioFinalSummary')?.addEventListener('input',()=>{if($('scenarioSaveStatus'))$('scenarioSaveStatus').textContent='Synthèse modifiée non enregistrée. Le brouillon est conservé sur cet appareil.';saveScenarioDraft();});
  $('structureScenarioText')?.addEventListener('click',structureScenarioSummary);
  $('restoreScenarioDraft')?.addEventListener('click',restoreScenarioDraft);
  $('compareMyAnalysis').addEventListener('click',compareMyAnalysis);
  updateScenarioEditorMeta();
  if(localStorage.getItem('aurevia_scenario_summary_draft'))restoreScenarioDraft();
  $('myAnalysisInstrument')?.addEventListener('change',updateScenarioEditorMeta);
  $('myAnalysisDirection')?.addEventListener('change',updateScenarioEditorMeta);
  $('clearAnalysisHistory').addEventListener('click',()=>{localStorage.removeItem('aurevia_analysis_history');renderAnalysisHistory();});
  $('createPositionBtn').addEventListener('click',createPositionFromForm);
  $('savePartialClose').addEventListener('click',savePartialCloseFromForm);
  $('generateTelegramCode').addEventListener('click',async()=>{const generate=$('generateTelegramCode'),unlink=$('unlinkTelegramAccount'),save=$('saveTelegramPrefs'),test=$('sendTelegramTest');try{generate.disabled=true;$('telegramPairStatus').textContent='Génération du code…';const code=await createTelegramPairingCode();$('telegramPairCode').textContent=code;$('telegramPairStatus').textContent='Code valable 10 minutes. Envoyez /start '+code+' au bot officiel.';unlink.disabled=false;save.disabled=false;test.disabled=false;for(let attempt=0;attempt<10;attempt++){await new Promise(resolve=>setTimeout(resolve,2000));const connection=await loadTelegramPreferences();if(connection?.chat_id){$('telegramConnectionStatus').textContent='Telegram connecté · conversation privée vérifiée.';$('telegramPairStatus').textContent='Liaison confirmée. Vous pouvez enregistrer vos préférences et envoyer un test.';break;}}await refreshTelegramHomeNotice();}catch(error){$('telegramPairStatus').textContent='Connexion Telegram impossible : '+error.message;}finally{generate.disabled=false;}});
  $('unlinkTelegramAccount')?.addEventListener('click',async()=>{
    const button=$('unlinkTelegramAccount'),status=$('telegramConnectionStatus');
    if(!await confirmInApp({title:'Délier Telegram ?',message:'Les notifications vers cette conversation seront arrêtées. Votre compte AUREVIA, vos trades et votre journal resteront intacts.',confirmLabel:'Délier Telegram',danger:true}))return;
    button.disabled=true;status.textContent='Déliaison en cours…';
    try{
      const result=await unlinkTelegramAccount();
      const verified=await loadTelegramPreferences();if(verified?.chat_id)throw new Error('La liaison Telegram est toujours présente côté serveur. Réessayez ou contactez le support.');
      status.textContent='Compte Telegram délié. Les notifications vers cette conversation sont arrêtées.'+(result.warning?' '+result.warning:'');
      $('telegramPairCode').textContent='Aucun code généré.';
      $('telegramPairStatus').textContent='Vous pouvez relier un compte Telegram à tout moment.';
      button.disabled=true;$('saveTelegramPrefs').disabled=true;$('sendTelegramTest').disabled=true;$('generateTelegramCode').disabled=false;
      $('notifyAll').checked=false;$('notifySignals').checked=true;$('notifyEconomic').checked=false;$('notifyProductAnnouncements').checked=false;await refreshTelegramHomeNotice();
    }catch(error){status.textContent='Déliaison impossible : '+error.message;button.disabled=false;}
  });
  $('saveTelegramPrefs').addEventListener('click',async()=>{try{await saveTelegramPreferences({all:$('notifyAll').checked,signals:$('notifySignals').checked,economic:$('notifyEconomic').checked,productAnnouncements:$('notifyProductAnnouncements').checked});$('telegramConnectionStatus').textContent='Préférences enregistrées.';}catch(error){$('telegramConnectionStatus').textContent=error.message;}});
  $('sendTelegramTest')?.addEventListener('click',async()=>{const status=$('telegramTestStatus');status.textContent='Envoi du test en cours…';$('sendTelegramTest').disabled=true;try{const result=await sendTelegramTest();status.textContent=result.sent?'Test accepté par Telegram. Vérifiez votre conversation avec @AureviaCopilotBot.':'Test non envoyé : '+(result.reason||'raison inconnue');}catch(error){status.textContent='Échec du test : '+error.message;}finally{$('sendTelegramTest').disabled=false;}});
  $('posMode').addEventListener('change',()=>{$('posModeHelp').textContent=$('posMode').value==='unique'?'Position unique : le lot saisi est réparti entre les TP sélectionnés.':'Trades séparés : le lot saisi est appliqué individuellement à chaque TP sélectionné.';});
  const syncOrderFields=()=>{const type=$('posOrderType').value;const isBuy=type.startsWith('BUY '),isSell=type.startsWith('SELL '),isStop=type.includes('STOP'),isLimit=type.endsWith('LIMIT');if(isBuy||isSell)$('posDirection').value=isBuy?'BUY':'SELL';$('posTriggerWrap').hidden=!isStop;$('posLimitWrap').hidden=!(isLimit||type.includes('STOP LIMIT'));$('posExpiryWrap').hidden=type==='MARKET';$('posTrigger').required=isStop;$('posLimit').required=isLimit||type.includes('STOP LIMIT');$('posTrigger').disabled=!isStop;$('posLimit').disabled=!(isLimit||type.includes('STOP LIMIT'));$('posExpiry').disabled=type==='MARKET';$('posLimit').placeholder=type.includes('STOP LIMIT')?'Prix limite après déclenchement':'Prix d’entrée limite';};
  $('posOrderType').addEventListener('change',syncOrderFields);$('posDirection').addEventListener('change',()=>{const type=$('posOrderType').value;if(type!=='MARKET'&&((type.startsWith('BUY')&&$('posDirection').value==='SELL')||(type.startsWith('SELL')&&$('posDirection').value==='BUY')))$('posOrderType').value='MARKET';syncOrderFields();});syncOrderFields();
  $('reduceMotion').addEventListener('change',e=>{localStorage.setItem('aurevia_reduce_motion',e.target.checked?'1':'0');document.documentElement.classList.toggle('reduce-motion',e.target.checked);window.dispatchEvent(new CustomEvent('aurevia:motionchange',{detail:{reduced:e.target.checked}}));});
  $('reduceMotion').checked=localStorage.getItem('aurevia_reduce_motion')==='1';document.documentElement.classList.toggle('reduce-motion',$('reduceMotion').checked);initAppInstallation();
}
let authenticatedBooted=false;
function bootAuthenticatedApp(){if(authenticatedBooted||!window.__aureviaAuthenticated)return;authenticatedBooted=true;refreshAccountCurrency();refreshTelegramHomeNotice();restoreMyAnalysis();refreshScenarioWatchList();setInterval(()=>{if(window.__aureviaAuthenticated)refreshScenarioWatchList();},60000);initJournal();renderJournal();renderPositions();renderLinkedJournal();setInterval(async()=>{if(!window.__aureviaAuthenticated)return;try{const restored=await restoreTradeGroupsFromSupabase();if(restored.restored){mergeRestoredTradeGroups(restored.groups,restored.journal);renderPositions();renderLinkedJournal();}}catch(error){console.warn('Actualisation du suivi cloud indisponible :',error.message);}},60000);initEconomicCalendar($('calendarWidget'));initEconomicCalendar($('calendarStandalone'));syncMarketAvailability();mountTradingView();mountDxyChart();refreshSelectedQuote();$('chartStatus').textContent='Données en attente · lancez une analyse pour interroger Twelve Data';$('chartSource').textContent='TradingView · données OHLC chargées à la demande';$('signalState').textContent='WAIT';$('signalExplain').textContent='Aucune requête de marché au démarrage. Appuyez sur Analyser pour charger H4 / H1 / M30 / M15 / M5.';$('mtfRows').innerHTML='<tr><td colspan="4" class="empty-cell">En attente du lancement manuel de l’analyse.</td></tr>';syncMarketAvailability();}
function init(){bindEvents();bindPositionContractFields();updateClock();setInterval(updateClock,1000);if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(()=>{});initAuth().then(()=>{if(window.__aureviaAuthenticated)bootAuthenticatedApp();}).catch(error=>console.warn('Initialisation AUREVIA différée :',error?.message||error));}
init();
