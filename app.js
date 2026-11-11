import { loadInstrumentAnalysis, getAnalysisState } from './analysis.js';
import { calculatePositionRisk } from './risk.js';
import { initJournal, addJournalTrade, renderJournal, loadJournalTrades } from './journal.js';
import { initEconomicCalendar } from './news.js';
import { initAuth, createTelegramPairingCode, loadTelegramPreferences, saveTelegramPreferences, sendTelegramTest, updateDisplayName, syncTradeGroupToSupabase, syncTradeCloseToSupabase, sendTelegramNotification, getAnalysisAccessToken } from './auth.js';
import { createTradeGroup, saveTradeGroup, loadTradeGroups, loadLinkedJournal, persistTradeGroup, recordPartialClose, groupSummary } from './trade-management.js';

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
let selectedSymbol='XAUUSD', selectedTf='60';

function updateClock(){
  const now=new Date();
  const time=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);
  const date=new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(now);
  $('topClock').textContent=time;$('fullClock').textContent=time;$('fullDate').textContent=date;
  renderSessions(now);
}
function zonedParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type==='hour'||p.type==='minute').map(p=>[p.type,Number(p.value)]));
}
function renderSessions(now){
  const sessions=[
    {name:'Sydney',zone:'Australia/Sydney',open:8,close:17},
    {name:'Tokyo',zone:'Asia/Tokyo',open:9,close:18},
    {name:'Londres',zone:'Europe/London',open:8,close:17},
    {name:'New York',zone:'America/New_York',open:8,close:17}
  ];
  const html=sessions.map(s=>{const p=zonedParts(now,s.zone),minute=p.hour*60+p.minute,start=s.open*60,end=s.close*60,open=minute>=start&&minute<end;return `<div class="session ${open?'open':''}"><span class="state">${open?'OUVERTE':'FERMÉE'}</span><b>${s.name}</b><small>${formatMinutes(start)} – ${formatMinutes(end)} · heure locale</small></div>`}).join('');
  if($('sessionList'))$('sessionList').innerHTML=html;if($('homeSessionList'))$('homeSessionList').innerHTML=html;
}
function formatMinutes(m){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function mountTradingView(){
  const container=$('tvChart');container.innerHTML='<div class="chart-placeholder"><span class="pulse-ring">◈</span><b>Initialisation du graphique</b><small>Chargement du fournisseur externe…</small></div>';
  const make=()=>{
    if(!window.TradingView){container.innerHTML='<div class="chart-placeholder"><b>Graphique indisponible</b><small>Le widget TradingView ne répond pas. Vérifiez votre connexion.</small></div>';return;}
    container.innerHTML='';
    try{new window.TradingView.widget({autosize:true,symbol:symbols[selectedSymbol].tv,interval:selectedTf,timezone:'Etc/UTC',theme:'dark',style:'1',locale:'fr',enable_publishing:false,allow_symbol_change:false,hide_top_toolbar:false,hide_legend:false,save_image:false,container_id:'tvChart',backgroundColor:'#0b0910',gridColor:'#24192c',studies:['STD;EMA'],withdateranges:true});$('chartStatus').textContent='Widget connecté';}
    catch(e){container.innerHTML='<div class="chart-placeholder"><b>Graphique indisponible</b><small>Impossible d’initialiser TradingView.</small></div>';}
  };
  if(window.TradingView)make();else{let attempts=0;const wait=setInterval(()=>{attempts++;if(window.TradingView||attempts>25){clearInterval(wait);make();}},200);}
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
  if(!symbols[symbol])return;selectedSymbol=symbol;$('instrumentSelect').value=symbol;
  document.querySelectorAll('.ticker').forEach(t=>t.classList.toggle('active',t.dataset.symbol===symbol));
  mountTradingView();loadAnalysis();
}
function setTimeframe(tf){selectedTf=tf;document.querySelectorAll('#timeframes button').forEach(b=>b.classList.toggle('selected',b.dataset.tf===tf));mountTradingView();}
async function loadAnalysis(){
  $('signalState').textContent='WAIT';$('signalExplain').textContent='Analyse descriptive en cours. Aucun signal n’est confirmé.';$('probabilityValue').textContent='—';$('probabilityBar').style.width='0%';
  const result=await loadInstrumentAnalysis(selectedSymbol);
  const state=getAnalysisState();
  if(result?.price && selectedSymbol==='XAUUSD'){$('price-XAUUSD').textContent=result.price.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});$('change-XAUUSD').textContent=`Twelve Data · OHLC M5 · ${result.status}`;}
  $('chartSource').textContent=selectedSymbol==='XAUUSD'?'TradingView + Twelve Data OHLC':'TradingView · graphique externe';
  $('chartStatus').textContent=state.message||'Données externes';
  $('mtfRows').innerHTML=state.rows?.length?state.rows.map(r=>`<tr><td>${r.tf}</td><td>${r.ema200===null?'—':Number(r.ema200).toFixed(2)}</td><td>${r.rsi14===null?'—':Number(r.rsi14).toFixed(1)}</td><td>${escapeText(r.bias)} · ${escapeText(r.breaks)}</td></tr>`).join(''):`<tr><td colspan="4" class="empty-cell">${state.tableMessage||'Données multi-timeframes indisponibles.'}</td></tr>`;
  $('signalState').textContent=state.decision||'WAIT';$('signalExplain').textContent=state.signalReason||'WAIT : données ou confirmations insuffisantes. Aucune probabilité n’est publiée sans calibration historique.';
  $('probabilityValue').textContent=Number.isFinite(state.score)?`${state.score} %`:'—';$('probabilityBar').style.width=`${Number.isFinite(state.score)?Math.max(0,Math.min(100,state.score)):0}%`;
  renderAITradePlan(state);
  renderStructureAnalysis(state);
  if(state.analysis)notifyLatestAnalysis(state,selectedSymbol).catch(()=>{});
}
function renderAITradePlan(state){
  const host=$('aiTradePlan');if(!host)return;
  const d=state.decisionDetails||{};
  const valid=['BUY','SELL'].includes(state.decision)&&d.pendingOrderType&&Number.isFinite(Number(d.entry))&&Number.isFinite(Number(d.stopLoss))&&Array.isArray(d.takeProfits)&&d.takeProfits.length>0;
  host.hidden=!valid;
  if(!valid)return;
  $('aiOrderType').textContent=d.pendingOrderType;
  $('aiEntry').textContent=String(d.entry);
  $('aiTrigger').textContent=d.triggerPrice===null||d.triggerPrice===undefined?'—':String(d.triggerPrice);
  $('aiLimit').textContent=d.limitPrice===null||d.limitPrice===undefined?'—':String(d.limitPrice);
  $('aiStopLoss').textContent=String(d.stopLoss);
  $('aiTakeProfits').textContent=d.takeProfits.join(' · ');
  $('aiInvalidation').textContent='Invalidation : '+(d.invalidation||'Non précisée par le moteur.');
}

function renderStructureAnalysis(state){
  const cards=$('structureCards'),checks=$('confluenceChecks'),patternsHost=$('patternList');
  if(!cards||!checks||!patternsHost)return;
  if(!state.analysis){cards.innerHTML='<div class="structure-card muted">'+escapeText(state.tableMessage||'Historiques OHLC indisponibles.')+'</div>';checks.innerHTML='<span class="muted">Confluence indisponible.</span>';patternsHost.innerHTML='<span class="muted">Aucune figure analysée.</span>';return;}
  cards.innerHTML=['H4','M30','M5'].map(tf=>{const a=state.analysis[tf],st=a.structure,ind=a.indicators,sw=st.swings||[],high=sw.filter(x=>x.type==='high').at(-1),low=sw.filter(x=>x.type==='low').at(-1);const breaks=(st.breaks||[]).map(x=>x.type).join(' · ')||'Aucune cassure confirmée';const sweeps=(st.sweeps||[]).map(x=>x.type).join(' · ')||'Aucun sweep confirmé';return `<article class="structure-card"><div class="structure-card-head"><b>${tf}</b><span>${escapeText(st.bias||'indéterminé')}</span></div><div class="structure-metrics"><span>EMA20 <b>${ind.ema20===null?'—':Number(ind.ema20).toFixed(2)}</b></span><span>EMA50 <b>${ind.ema50===null?'—':Number(ind.ema50).toFixed(2)}</b></span><span>EMA100 <b>${ind.ema100===null?'—':Number(ind.ema100).toFixed(2)}</b></span><span>EMA200 <b>${ind.ema200===null?'—':Number(ind.ema200).toFixed(2)}</b></span><span>RSI14 <b>${ind.rsi14===null?'—':Number(ind.rsi14).toFixed(1)}</b></span><span>MACD <b>${ind.macd?Number(ind.macd.line).toFixed(3):'—'}</b></span><span>ATR14 <b>${ind.atr14===null?'—':Number(ind.atr14).toFixed(3)}</b></span><span>BB haute / basse <b>${ind.bollinger?Number(ind.bollinger.upper).toFixed(2)+' / '+Number(ind.bollinger.lower).toFixed(2):'—'}</b></span></div><p><small>Structure</small>${escapeText(breaks)}</p><p><small>Liquidité</small>${escapeText(sweeps)}</p><p><small>FVG / OB candidats</small>${(st.fvg||[]).filter(x=>!x.mitigated).length} FVG actifs · ${(st.orderBlocks||[]).filter(x=>!x.mitigated).length} OB non mitigés</p><p><small>Fibonacci 38,2 / 50 / 61,8</small>${a.fibonacci?a.fibonacci.levels.map(x=>Number(x.price).toFixed(2)).join(' · '):'Indisponible'}</p><p><small>Volume Profile fixe · POC / VAL / VAH</small>${a.volumeProfile?[a.volumeProfile.poc,a.volumeProfile.val,a.volumeProfile.vah].map(x=>Number(x).toFixed(2)).join(' · '):'Volume indisponible ou historique insuffisant'}</p><p><small>Derniers niveaux</small>H ${high?Number(high.price).toFixed(2):'—'} · L ${low?Number(low.price).toFixed(2):'—'}</p></article>`;}).join('');
  checks.innerHTML=(state.scoreComponents||[]).map(x=>`<span class="confluence-item ${x.passed?'passed':'pending'}"><b>${x.passed?'✓':'○'}</b>${escapeText(x.label)}</span>`).join('')||'<span class="muted">Confluence indisponible.</span>';
  const found=['H4','M30','M5'].flatMap(tf=>(state.analysis[tf].patterns||[]).map(p=>({tf,...p})));
  patternsHost.innerHTML=found.length?found.map(p=>`<span class="pattern-chip"><b>${escapeText(p.name)}</b><small>${p.tf} · ${escapeText(p.confirmation||'à confirmer')}</small></span>`).join(''):'<span class="muted">Aucune figure détectée sur les dernières bougies.</span>';
}
async function notifyLatestAnalysis(state,symbol){
  const candle=state.frames?.M5?.candles?.at(-1)?.time;if(!candle)return;
  const key=`${symbol}:${candle}:${state.decision||'WAIT'}`;
  if(localStorage.getItem('aurevia_last_telegram_analysis')===key)return;
  const details=state.decisionDetails||{};
  const lines=[`AUREVIA COPILOT · ${symbol}`,`Décision : ${state.decision||'WAIT'}`,`Score de confirmation : ${Number.isFinite(state.score)?state.score+'/100':'indisponible'}`,`Motif : ${details.reason||state.signalReason||'Confluence insuffisante.'}`];
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

function readMyAnalysis(){
  return {instrument:$('myAnalysisInstrument').value,timeframe:$('myAnalysisTf').value,direction:$('myAnalysisDirection').value,entry:$('myAnalysisEntry').value.trim(),sl:$('myAnalysisSL').value.trim(),tp:$('myAnalysisTP').value.trim(),structure:$('myAnalysisStructure').value.trim(),reason:$('myAnalysisReason').value.trim(),invalidation:$('myAnalysisInvalidation').value.trim(),updatedAt:new Date().toISOString()};
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
  $('independentAnalysisTitle').textContent='Analyse indépendante · '+data.instrument;
  $('independentAnalysisText').textContent='AUREVIA affiche son état d’analyse indépendant avant la confrontation. '+(data.instrument===selectedSymbol?'':'Instrument différent du graphique actuellement affiché : aucune lecture de ce graphique ne sera supposée.');
  const state=data.instrument===selectedSymbol?getAnalysisState():null;
  // Le moteur V2.2 ne dispose pas encore d'un flux OHLC validé pour calculer une direction indépendante.
  const aiDirection='WAIT';
  const limitation=state?.signalReason||'Le flux OHLC multi-unités et les indicateurs calculés ne sont pas connectés/validés pour cet instrument. Le graphique TradingView externe n’est pas lu automatiquement.';
  $('independentAnalysisTitle').textContent='WAIT · données insuffisantes pour conclure';
  $('independentAnalysisText').textContent=`Instrument : ${data.instrument} · Unité demandée : ${data.timeframe}.\n\nConclusion indépendante : WAIT.\n\nMotif : ${limitation}\n\nAUREVIA ne fabrique ni structure BOS/CHoCH, ni niveaux, ni probabilité. Une cotation isolée ou un graphique externe non lu ne suffit pas à valider BUY ou SELL.`;
  const same=data.direction===aiDirection;
  $('confrontationTitle').textContent=same?'Accord provisoire sur WAIT':'Divergence : votre scénario / WAIT indépendant';
  const lines=[];
  lines.push(`Votre scénario : ${data.direction}. Conclusion indépendante actuelle : ${aiDirection}.`);
  lines.push(same?'Les deux lectures indiquent l’attente, mais cela ne constitue pas une confirmation technique.':'Votre scénario directionnel n’est ni confirmé ni invalidé : le moteur ne possède pas encore les données nécessaires pour le tester.');
  if(data.entry||data.sl||data.tp)lines.push(`Niveaux que vous proposez — Entrée : ${data.entry||'non renseignée'} · SL : ${data.sl||'non renseigné'} · TP : ${data.tp||'non renseigné'}. Ces niveaux restent vos hypothèses, ils ne sont pas validés par l’IA.`);
  if(data.structure)lines.push('Votre lecture de structure : '+data.structure);
  if(data.reason)lines.push('Votre justification : '+data.reason);
  if(data.invalidation)lines.push('Votre invalidation : '+data.invalidation);
  lines.push('À obtenir pour une vraie confrontation : historiques OHLC fiables sur les unités choisies, calcul des indicateurs, structure/liquidité et contexte fondamental actualisé.');
  $('confrontationText').textContent=lines.join('\n\n');
  let history=[];try{history=JSON.parse(localStorage.getItem('aurevia_analysis_history')||'[]')}catch{}
  history.unshift({date:new Date().toISOString(),instrument:data.instrument,timeframe:data.timeframe,userDirection:data.direction,aiDirection,summary:same?'Attente partagée, non confirmée.':'Scénario utilisateur non vérifiable avec les données actuelles.'});
  localStorage.setItem('aurevia_analysis_history',JSON.stringify(history.slice(0,30)));renderAnalysisHistory();
}
function restoreMyAnalysis(){
  try{const d=JSON.parse(localStorage.getItem('aurevia_my_analysis')||'null');if(d){$('myAnalysisInstrument').value=d.instrument||'XAUUSD';$('myAnalysisTf').value=d.timeframe||'M30';$('myAnalysisDirection').value=d.direction||'WAIT';$('myAnalysisEntry').value=d.entry||'';$('myAnalysisSL').value=d.sl||'';$('myAnalysisTP').value=d.tp||'';$('myAnalysisStructure').value=d.structure||'';$('myAnalysisReason').value=d.reason||'';$('myAnalysisInvalidation').value=d.invalidation||'';$('myAnalysisStatus').textContent='Dernière analyse personnelle restaurée depuis cet appareil.';}}catch{}
  renderAnalysisHistory();
}

async function loadServiceStatus(){
  const labels={ai:['serviceGroq','Moteur IA Groq'],marketData:['serviceMarketData','Données Twelve Data'],supabase:['serviceSupabase','Supabase serveur'],telegram:['serviceTelegram','Notifications Telegram']};
  try{const response=await fetch('/api/service-status',{cache:'no-store'});if(!response.ok)throw new Error('Statut serveur indisponible.');const data=await response.json();for(const [key,[id,label]] of Object.entries(labels)){const el=$(id);const configured=Boolean(data.services?.[key]?.configured);const text=`${label} : ${configured?'configuré côté serveur':'non configuré côté serveur'}`;if(el){el.textContent=text;el.dataset.state=configured?'ready':'missing';}const adminId={ai:'adminServiceGroq',marketData:'adminServiceMarketData',supabase:'adminServiceSupabase',telegram:'adminServiceTelegram'}[key];if($(adminId))$(adminId).textContent=text;}}
  catch{for(const [key,[id,label]] of Object.entries(labels)){const text=`${label} : statut indisponible (vérification au prochain accès)`;if($(id))$(id).textContent=text;const adminId={ai:'adminServiceGroq',marketData:'adminServiceMarketData',supabase:'adminServiceSupabase',telegram:'adminServiceTelegram'}[key];if($(adminId))$(adminId).textContent=text;}}
}


async function adminRequest(payload=null,query=''){const token=await getAnalysisAccessToken();if(!token)throw new Error('Connectez-vous pour continuer.');const response=await fetch('/api/admin'+query,{method:payload?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});const data=await response.json().catch(()=>({error:'Réponse serveur illisible.'}));if(!response.ok)throw new Error(data.error||'Action administrateur impossible.');return data;}
function renderAdminUsers(users){const host=$('adminUsersRows');if(!host)return;const rows=(users||[]).filter(u=>{const q=($('adminUserSearch')?.value||'').toLowerCase();return !q||String(u.email||'').toLowerCase().includes(q)||String(u.display_name||'').toLowerCase().includes(q);});host.innerHTML=rows.length?rows.map(u=>{const suspended=Boolean(u.banned_until&&new Date(u.banned_until)>new Date());return `<tr><td>${escapeText(u.display_name||u.email||u.id)}<small>${escapeText(u.email||'')}</small></td><td>${u.created_at?new Date(u.created_at).toLocaleDateString():'—'}</td><td>${u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString():'Jamais'}</td><td>${u.role==='admin'?'Administrateur':'Utilisateur'}</td><td>${suspended?'Suspendu':'Actif'}</td><td><div class="table-actions">${u.role==='admin'?`<button class="small-btn" data-admin-action="revoke_admin" data-user="${u.id}">Retirer admin</button>`:`<button class="small-btn" data-admin-action="grant_admin" data-user="${u.id}">Promouvoir</button>`}${suspended?`<button class="small-btn" data-admin-action="activate" data-user="${u.id}">Réactiver</button>`:`<button class="small-btn" data-admin-action="suspend" data-user="${u.id}">Suspendre</button>`}</div></td></tr>`;}).join(''):'<tr><td colspan="6" class="empty-cell">Aucun compte correspondant.</td></tr>';
 host.querySelectorAll('[data-admin-action]').forEach(btn=>btn.addEventListener('click',async()=>{const action=btn.dataset.adminAction,user_id=btn.dataset.user;if(!confirm(`Confirmer l’action « ${action} » ?`))return;btn.disabled=true;try{await adminRequest({action,user_id});await loadAdminConsole();}catch(e){alert(e.message);btn.disabled=false;}}));}

function renderAdminAnnouncements(items){const host=$('adminAnnouncementsRows');if(!host)return;host.innerHTML=items?.length?items.map(a=>`<tr><td>${escapeText(a.title)}</td><td>${escapeText(a.category)}</td><td>${a.is_published?'Publiée':'Brouillon'}</td><td><button class="small-btn" data-announcement-toggle="${a.id}" data-published="${a.is_published?'true':'false'}">${a.is_published?'Dépublier':'Publier'}</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">Aucune annonce.</td></tr>';host.querySelectorAll('[data-announcement-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await adminRequest({action:'announcement_publish',announcement_id:btn.dataset.announcementToggle,is_published:btn.dataset.published!=='true'});await loadAdminConsole(adminPage);}catch(e){alert(e.message);btn.disabled=false;}}));}
function renderAdminAudit(items){const host=$('adminAuditRows');if(!host)return;host.innerHTML=items?.length?items.map(a=>`<tr><td>${a.created_at?new Date(a.created_at).toLocaleString():'—'}</td><td>${escapeText(a.action)}</td><td>${escapeText(a.actor_id||'—')}</td><td>${escapeText(a.target_user_id||'—')}</td><td>${escapeText(JSON.stringify(a.details||{}))}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">Aucune action enregistrée.</td></tr>';}

let adminUsersCache=[],adminPage=1,adminHasMore=false;
async function loadAdminConsole(page=adminPage){try{adminPage=Math.max(1,page);const data=await adminRequest(null,`?page=${adminPage}`);adminHasMore=Boolean(data.pagination?.has_more);$('adminUsersPage').textContent=`Page ${adminPage}`;$('adminUsersPrev').disabled=adminPage<=1;$('adminUsersNext').disabled=!adminHasMore;$('adminUnlocked')?.removeAttribute('hidden');$('adminUsersPanel')?.removeAttribute('hidden');$('adminAnnouncementsPanel')?.removeAttribute('hidden');$('adminAuditPanel')?.removeAttribute('hidden');$('adminStatProfiles').textContent=data.stats?.profiles??'—';$('adminStatTrades').textContent=data.stats?.trading_journal??'—';$('adminStatPositions').textContent=data.stats?.trading_position_groups??'—';$('adminStatTelegram').textContent=data.stats?.telegram_connections??'—';adminUsersCache=data.users||[];renderAdminUsers(adminUsersCache);renderAdminAnnouncements(data.announcements||[]);renderAdminAudit(data.auditLog||[]);loadServiceStatus();}catch(error){$('adminUnlocked')?.setAttribute('hidden','');$('adminUsersPanel')?.setAttribute('hidden','');$('adminAnnouncementsPanel')?.setAttribute('hidden','');$('adminAuditPanel')?.setAttribute('hidden','');if($('adminBootstrapStatus'))$('adminBootstrapStatus').textContent=error.message;}}

async function loadTelegramUi(){try{const prefs=await loadTelegramPreferences();const status=$('telegramConnectionStatus');if(!prefs){status.textContent='Connectez-vous dans Paramètres & profil pour associer Telegram.';$('saveTelegramPrefs').disabled=true;$('sendTelegramTest').disabled=true;return;}status.textContent=prefs.chat_id?'Compte Telegram associé.':'Compte Telegram non associé.';$('notifyAll').checked=Boolean(prefs.notify_all_analyses);$('notifySignals').checked=Boolean(prefs.notify_validated_signals);$('notifyEconomic').checked=Boolean(prefs.notify_economic_announcements);$('saveTelegramPrefs').disabled=!prefs.chat_id;$('sendTelegramTest').disabled=!prefs.chat_id;}catch(error){$('telegramConnectionStatus').textContent=error.message;}}
function renderJournalStats(){
  const manual=loadJournalTrades(),linked=loadLinkedJournal();
  const closedLinked=linked.filter(x=>x.status==='CLOSED');
  const wins=manual.filter(x=>Number(x.result)>0).length+closedLinked.filter(x=>Number(x.realizedPnl)>0).length;
  const closedCount=manual.length+closedLinked.length;
  const totalCount=manual.length+linked.length;
  const net=manual.reduce((sum,x)=>sum+Number(x.result||0),0)+linked.reduce((sum,x)=>sum+Number(x.realizedPnl||0),0);
  $('journalCount').textContent=totalCount;$('journalWins').textContent=wins;$('journalWinRate').textContent=closedCount?`${(wins/closedCount*100).toFixed(1)} %`:'—';$('journalNet').textContent=net.toFixed(2);
}

function renderLinkedJournal(){const host=$('linkedJournalRows');if(!host)return;const rows=loadLinkedJournal();host.innerHTML=rows.length?rows.map(r=>`<tr><td>${escapeText(r.instrument)}</td><td>${r.mode==='unique'?'Position unique':'Trades séparés'}</td><td>${r.direction}</td><td>${escapeText(r.tpLabel||`${r.childIds?.length||0} TP`)}${r.lot?` · ${Number(r.lot).toFixed(2)} lot` : ''}</td><td>${Number(r.realizedPnl||0).toFixed(2)}</td><td>${r.status==='OPEN'?'OUVERTE':'CLÔTURÉE'}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">Aucune fiche liée.</td></tr>';renderJournalStats(); }
function renderPositions(){
  const host=$('positionRows');if(!host)return;
  const groups=loadTradeGroups();$('positionCount').textContent=`${groups.length} groupe(s)`;
  const rows=groups.flatMap(g=>g.children.map(c=>({g,c})));
  host.innerHTML=rows.length?rows.map(({g,c})=>`<tr><td>${escapeText(g.instrument)}</td><td>${g.mode==='unique'?'Position unique':'Trades séparés'}</td><td>${c.direction}</td><td>${escapeText(c.tpLabel)} · ${Number(c.takeProfit)}</td><td>${Number(c.initialLot).toFixed(2)}</td><td>${Number(c.remainingLot).toFixed(2)}</td><td class="${c.realizedPnl>=0?'good':'bad'}">${Number(c.realizedPnl).toFixed(2)}</td><td>${c.status==='OPEN'?'OUVERTE':'CLÔTURÉE'}</td><td>${c.status==='OPEN'?`<button class="small-btn" data-close-child="${c.id}">Clôturer</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="9" class="empty-cell">Aucune position enregistrée.</td></tr>';
  renderLinkedJournal();
  host.querySelectorAll('[data-close-child]').forEach(btn=>btn.addEventListener('click',()=>{const childId=btn.dataset.closeChild,group=groups.find(g=>g.children.some(c=>c.id===childId)),child=group?.children.find(c=>c.id===childId);$('closeChildId').value=childId;$('closeVolume').value='';$('closeVolume').step=String(group?.lotStep||0.01);$('closeVolume').min=String(group?.lotStep||0.01);$('closeVolume').max=String(child?.remainingLot||'');$('closeExit').value='';$('closeFees').value='';$('closePositionDialog').showModal();}));
}
function mountStandaloneDxy(){const host=$('dxyStandalone');if(!host||host.dataset.loaded)return;host.dataset.loaded='1';const frame=document.createElement('iframe');frame.title='Graphique DXY sur TradingView';frame.loading='lazy';frame.referrerPolicy='no-referrer-when-downgrade';frame.style.width='100%';frame.style.height='420px';frame.style.border='0';frame.src='https://s.tradingview.com/widgetembed/?frameElementId=dxy_standalone&symbol=TVC%3ADXY&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=0b1222&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&locale=fr';host.replaceChildren(frame);}
function createPositionFromForm(){
  const tps=[1,2,3].map(i=>({label:`TP${i}`,price:Number($(`posTP${i}`).value)})).filter(x=>Number.isFinite(x.price)&&x.price>0);
  try{
    const group=createTradeGroup({mode:$('posMode').value,instrument:$('posInstrument').value,direction:$('posDirection').value,lot:Number($('posLot').value),lotStep:Number($('posLotStep').value),entry:Number($('posEntry').value),stopLoss:Number($('posSL').value),takeProfits:tps,autoJournal:$('posAutoJournal').checked,orderType:$('posOrderType').value,triggerPrice:$('posTrigger').value.trim()?Number($('posTrigger').value):null,limitPrice:$('posLimit').value.trim()?Number($('posLimit').value):null,contractSize:$('posContract').value.trim()?Number($('posContract').value):null,quoteToAccount:Number($('posConversion').value||1),feesPerLot:Number($('posFees').value||0)});
    saveTradeGroup(group);renderPositions();syncTradeGroupToSupabase(group).then(r=>{if(r.synced)alert(`Position enregistrée et synchronisée : ${group.children.length} trade(s).`);else alert(`Position enregistrée sur cet appareil : connectez-vous à Supabase pour la synchroniser. ${group.autoJournal?'Fiche locale liée au journal créée.':'Journal automatique désactivé.'}`);}).catch(error=>alert(`Position conservée localement, mais synchronisation cloud impossible : ${error.message}`));
  }catch(error){alert(error.message);}
}
function savePartialCloseFromForm(){
  try{
    const childId=$('closeChildId').value;const groups=loadTradeGroups();const group=groups.find(g=>g.children.some(c=>c.id===childId));if(!group)throw new Error('Position introuvable.');
    const fees=$('closeFees').value.trim()===''?null:Number($('closeFees').value);
    recordPartialClose(group,childId,{volume:Number($('closeVolume').value),exit:Number($('closeExit').value),contractSize:group.contractSize,quoteToAccount:group.quoteToAccount,feesPerLot:group.feesPerLot,fees});
    const child=group.children.find(x=>x.id===childId),closeEvent=child.closes.at(-1);persistTradeGroup(group);$('closePositionDialog').close();renderPositions();renderJournal();renderLinkedJournal();syncTradeCloseToSupabase(group,child,closeEvent).catch(error=>alert(`Clôture enregistrée localement, mais synchronisation cloud impossible : ${error.message}`));
  }catch(error){alert(error.message);}
}
function bindEvents(){
  window.addEventListener('aurevia:authchange',()=>loadAnalysis());
  window.addEventListener('aurevia:adminchange',event=>{if(event.detail?.isAdmin&&location.hash==='#admin')loadServiceStatus();});
  $('instrumentSelect').addEventListener('change',e=>setSelectedSymbol(e.target.value));
  document.querySelectorAll('.ticker').forEach(t=>t.addEventListener('click',()=>{document.querySelector('[data-page="marches"]')?.click();setSelectedSymbol(t.dataset.symbol);}));
  document.querySelectorAll('#timeframes button').forEach(b=>b.addEventListener('click',()=>setTimeframe(b.dataset.tf)));
  $('refreshBtn').addEventListener('click',()=>{mountTradingView();loadAnalysis();});
  $('menuToggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
  const showPage = page => {
    document.querySelectorAll('[data-page-view]').forEach(v=>v.classList.toggle('active',v.dataset.pageView===page));
    document.querySelectorAll('[data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===page));
    $('sidebar').classList.remove('open');
    if(page==='marches'){mountTradingView();mountDxyChart();mountTickerTape();}
    if(page==='positions')renderPositions();
    if(page==='dxy')mountStandaloneDxy();
    if(page==='telegram')loadTelegramUi();
    if(page==='parametres'||page==='admin')loadServiceStatus();
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
    const entry=Number($('entryPrice').value),stop=Number($('stopPrice').value),tp=Number($('takeProfit').value);
    const enteredDistance=Number($('slDistance').value);const distance=enteredDistance>0?enteredDistance:(entry>0&&stop>0?Math.abs(entry-stop):NaN);
    const reward=entry>0&&tp>0?Math.abs(tp-entry):null;
    const result=calculatePositionRisk({balance:Number($('accountBalance').value),riskAmount:Number($('riskAmount').value),stopDistance:distance,unitValuePerLot:Number($('unitValue').value),lotStep:Number($('lotStep').value),rewardDistance:reward,marginPerLot:$('marginPerLot').value.trim()?Number($('marginPerLot').value):null});
    $('riskResult').textContent=result.error||`Calcul estimatif pour ${$('riskInstrument').value} · ${result.lots.toFixed(2)} lot(s) · risque réellement engagé : ${result.riskMoney.toFixed(2)} ${$('accountCurrency').value}`;
    $('riskMoneyOut').textContent=result.error?'—':`${result.riskMoney.toFixed(2)} ${$('accountCurrency').value}`;$('lotsOut').textContent=result.error?'—':result.lots.toFixed(2);$('lossOut').textContent=result.error?'—':`${result.riskMoney.toFixed(2)} ${$('accountCurrency').value}`;$('gainOut').textContent=result.error||result.gain===null?'—':`${result.gain.toFixed(2)} ${$('accountCurrency').value}`;$('rrOut').textContent=result.error||result.rr===null?'—':`1:${result.rr.toFixed(2)}`;$('riskPctOut').textContent=result.error||result.riskPercentActual===null?'—':`${result.riskPercentActual.toFixed(2)} %`;$('marginOut').textContent=result.error||result.margin===null?'—':`${result.margin.toFixed(2)} ${$('accountCurrency').value}`;
  });
  $('addTradeBtn').addEventListener('click',()=>$('tradeDialog').showModal());
  $('saveTrade').addEventListener('click',()=>{
    const result=addJournalTrade({instrument:$('tradeInstrument').value,direction:$('tradeDirection').value,result:Number($('tradeResult').value),date:$('tradeDate').value,note:$('tradeNote').value});
    if(result.ok){renderJournal();renderJournalStats();$('tradeDialog').close();$('tradeForm').reset();}else alert(result.error);
  });
  $('settingsBtn').addEventListener('click',()=>document.querySelector('[data-page="parametres"]')?.click());
  $('adminRefreshStatus')?.addEventListener('click',()=>loadAdminConsole(adminPage));$('adminUsersPrev')?.addEventListener('click',()=>loadAdminConsole(adminPage-1));$('adminUsersNext')?.addEventListener('click',()=>loadAdminConsole(adminPage+1));$('adminUserSearch')?.addEventListener('input',()=>renderAdminUsers(adminUsersCache));$('adminBootstrap')?.addEventListener('click',async()=>{const status=$('adminBootstrapStatus');status.textContent='Vérification sécurisée…';try{await adminRequest({action:'bootstrap'});status.textContent='Accès initialisé. Rechargement du profil…';location.reload();}catch(e){status.textContent=e.message;}});$('adminCreateAnnouncement')?.addEventListener('click',async()=>{const status=$('adminAnnouncementStatus');status.textContent='Enregistrement…';try{await adminRequest({action:'announcement_create',title:$('adminAnnouncementTitle').value,body:$('adminAnnouncementBody').value,category:$('adminAnnouncementCategory').value,source_url:$('adminAnnouncementUrl').value||null,is_published:$('adminAnnouncementPublish').checked});$('adminAnnouncementTitle').value='';$('adminAnnouncementBody').value='';status.textContent='Annonce enregistrée.';}catch(e){status.textContent=e.message;}});window.addEventListener('aurevia:adminchange',e=>{if(e.detail?.isAdmin)loadAdminConsole();});
  $('saveProfileName')?.addEventListener('click',async()=>{const btn=$('saveProfileName');btn.disabled=true;try{const value=await updateDisplayName($('profileDisplayName').value);$('authStatus').textContent='Profil enregistré : '+value;}catch(error){$('authStatus').textContent='Profil non enregistré : '+error.message;}finally{btn.disabled=false;}});
  $('saveMyAnalysis').addEventListener('click',saveMyAnalysis);
  $('compareMyAnalysis').addEventListener('click',compareMyAnalysis);
  $('clearAnalysisHistory').addEventListener('click',()=>{localStorage.removeItem('aurevia_analysis_history');renderAnalysisHistory();});
  $('createPositionBtn').addEventListener('click',createPositionFromForm);
  $('savePartialClose').addEventListener('click',savePartialCloseFromForm);
  $('generateTelegramCode').addEventListener('click',async()=>{try{$('telegramPairStatus').textContent='Génération du code…';const code=await createTelegramPairingCode();$('telegramPairCode').textContent=code;$('telegramPairStatus').textContent='Code valable 10 minutes. Envoyez /start '+code+' au bot officiel.';}catch(error){$('telegramPairStatus').textContent=error.message;}});
  $('saveTelegramPrefs').addEventListener('click',async()=>{try{await saveTelegramPreferences({all:$('notifyAll').checked,signals:$('notifySignals').checked,economic:$('notifyEconomic').checked});$('telegramConnectionStatus').textContent='Préférences enregistrées.';}catch(error){$('telegramConnectionStatus').textContent=error.message;}});
  $('sendTelegramTest')?.addEventListener('click',async()=>{const status=$('telegramTestStatus');status.textContent='Envoi du test en cours…';$('sendTelegramTest').disabled=true;try{const result=await sendTelegramTest();status.textContent=result.sent?'Test accepté par Telegram. Vérifiez votre conversation avec @AureviaCopilotBot.':'Test non envoyé : '+(result.reason||'raison inconnue');}catch(error){status.textContent='Échec du test : '+error.message;}finally{$('sendTelegramTest').disabled=false;}});
  $('posMode').addEventListener('change',()=>{$('posModeHelp').textContent=$('posMode').value==='unique'?'Position unique : le lot saisi est réparti entre les TP sélectionnés.':'Trades séparés : le lot saisi est appliqué individuellement à chaque TP sélectionné.';});
  $('reduceMotion').addEventListener('change',e=>{localStorage.setItem('aurevia_reduce_motion',e.target.checked?'1':'0');document.documentElement.classList.toggle('reduce-motion',e.target.checked);window.dispatchEvent(new CustomEvent('aurevia:motionchange',{detail:{reduced:e.target.checked}}));});
  $('reduceMotion').checked=localStorage.getItem('aurevia_reduce_motion')==='1';document.documentElement.classList.toggle('reduce-motion',$('reduceMotion').checked);
}
function init(){bindEvents();initAuth();if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(()=>{});restoreMyAnalysis();initJournal();renderJournal();renderPositions();renderLinkedJournal();initEconomicCalendar($('calendarWidget'));initEconomicCalendar($('calendarStandalone'));updateClock();setInterval(updateClock,1000);mountTradingView();mountDxyChart();mountTickerTape();loadAnalysis();}
init();
