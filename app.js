import { loadInstrumentAnalysis, getAnalysisState } from './analysis.js';
import { MARKET_INSTRUMENTS } from './market-catalog.js';
import { getMarketStatus } from './market-hours.js';
import { calculatePositionRisk } from './risk.js';
import { initJournal, addJournalTrade, renderJournal, loadJournalTrades, deleteJournalTrade } from './journal.js';
import { initEconomicCalendar } from './news.js';
import { initAuth, confirmInApp, showInAppNotice, createTelegramPairingCode, loadTelegramPreferences, saveTelegramPreferences, unlinkTelegramAccount, sendTelegramTest, loadPublishedAnnouncements, markAnnouncementAsRead, markAllAnnouncementsAsRead, syncTradeGroupToSupabase, syncTradeCloseToSupabase, sendTelegramNotification, getAnalysisAccessToken, loadAccountCurrency, saveAccountCurrency, restoreTradeGroupsFromSupabase, deleteClosedTradeGroupFromSupabase, deleteOpenTradeGroupFromSupabase, deletePendingTradeFromSupabase, deleteTradePositionFromSupabase, deleteLinkedJournalEntryFromSupabase } from './auth.js';
import { createTradeGroup, validatePendingOrderAgainstQuote, saveTradeGroup, loadTradeGroups, loadLinkedJournal, persistTradeGroup, recordPartialClose, calculateClosePnl, groupSummary, mergeRestoredTradeGroups, deleteClosedTradeGroup, deleteOpenTradeGroup, deleteLinkedJournalEntry, deletePendingTradeGroup, deletePendingSeparateTradeChild, deleteSeparateTradeChild, editOpenTradeGroup, editSeparateTradeChild, attachCloudJournalIds, markTradeGroupCloudSyncPending, markTradeCloseCloudSyncPending } from './trade-management.js';
import { validateContractSpec, calculateEstimatedMargin } from './contract-engine.js';
import { inferQuoteCurrency, validateFxSnapshot } from './fx-conversion.js';
import { validateMarketQuote } from './market-quote-validation.js';

const $ = id => document.getElementById(id);
const symbols = Object.fromEntries(Object.entries(MARKET_INSTRUMENTS).map(([id,item])=>[id,{label:item.label,tv:item.tv,provider:item.provider,market:item.market}]));
let selectedSymbol='XAUUSD', selectedTf='15';
let accountCurrency=null;
let tradingViewMountToken=0, tradingViewRetryTimer=null, tradingViewResizeObserver=null;
let deferredInstallPrompt=null;
const TRADE_SYNC_QUEUE_KEY='aurevia-cloud-sync-retry-v1';
let tradeSyncFlushBusy=false;
function readTradeSyncQueue(){
  try{const value=JSON.parse(localStorage.getItem(TRADE_SYNC_QUEUE_KEY)||'{}');return {groups:Array.isArray(value.groups)?value.groups:[],closes:Array.isArray(value.closes)?value.closes:[]};}
  catch{return {groups:[],closes:[]};}
}
function writeTradeSyncQueue(queue){
  try{localStorage.setItem(TRADE_SYNC_QUEUE_KEY,JSON.stringify(queue));return true;}
  catch{return false;}
}
function queueTradeGroupSync(groupId,telegramText=null){
  const queue=readTradeSyncQueue(),existing=queue.groups.find(item=>item.groupId===groupId);
  if(existing){if(telegramText)existing.telegramText=telegramText;}
  else queue.groups.push({groupId,telegramText,queuedAt:new Date().toISOString()});
  markTradeGroupCloudSyncPending(groupId,true);
  if(!writeTradeSyncQueue(queue))throw new Error('Impossible de conserver la demande de synchronisation sur cet appareil.');
}
function queueTradeCloseSync(groupId,childId,closeId,telegramText=null){
  const queue=readTradeSyncQueue();
  if(!queue.closes.some(item=>item.closeId===closeId))queue.closes.push({groupId,childId,closeId,telegramText,queuedAt:new Date().toISOString()});
  markTradeCloseCloudSyncPending(groupId,childId,closeId,true);
  if(!writeTradeSyncQueue(queue))throw new Error('Impossible de conserver la clôture en attente de synchronisation.');
}
async function flushTradeSyncQueue(){
  if(tradeSyncFlushBusy||!window.__aureviaAuthenticated)return {synced:0,pending:true};
  tradeSyncFlushBusy=true;let synced=0;
  try{
    let queue=readTradeSyncQueue();
    for(const item of [...queue.groups]){
      const group=loadTradeGroups().find(row=>row.id===item.groupId);
      if(!group){queue.groups=queue.groups.filter(row=>row.groupId!==item.groupId);writeTradeSyncQueue(queue);continue;}
      try{
        const result=await syncTradeGroupToSupabase(group);
        if(!result?.synced)continue;
        if(result.journalMappings)attachCloudJournalIds(group.id,result.journalMappings);
        markTradeGroupCloudSyncPending(group.id,false);
        queue.groups=queue.groups.filter(row=>row.groupId!==item.groupId);writeTradeSyncQueue(queue);synced++;
        if(item.telegramText)sendTelegramNotification({type:'trade_open',text:item.telegramText}).catch(()=>{});
        showInAppNotice('Position et journal confirmés dans le cloud AUREVIA.',{type:'success'});
      }catch(error){console.warn('Synchronisation cloud du trade différée :',error.message);}
    }
    queue=readTradeSyncQueue();
    for(const item of [...queue.closes]){
      const group=loadTradeGroups().find(row=>row.id===item.groupId);
      const child=group?.children.find(row=>row.id===item.childId);
      const closeEvent=child?.closes?.find(row=>row.id===item.closeId);
      if(!group||!child||!closeEvent){queue.closes=queue.closes.filter(row=>row.closeId!==item.closeId);writeTradeSyncQueue(queue);continue;}
      try{
        const result=await syncTradeCloseToSupabase(group,child,closeEvent);
        if(!result?.synced)continue;
        markTradeCloseCloudSyncPending(group.id,child.id,closeEvent.id,false);
        queue.closes=queue.closes.filter(row=>row.closeId!==item.closeId);writeTradeSyncQueue(queue);synced++;
        if(item.telegramText)const closeTelegramText=`AUREVIA COPILOT · CLÔTURE CONFIRMÉE\\n${latestGroup.instrument} · ${closedChild.direction} · ${closedChild.tpLabel}\\nVolume clôturé : ${closeEvent.volume}\\nCours de référence Twelve Data : ${closeEvent.exit}\\nRésultat net estimé : ${Number(closeEvent.net).toFixed(2)} ${finalCurrency}\\nVolume restant sur ce lot : ${closedChild.remainingLot}\\nSuivi interne AUREVIA uniquement · aucun ordre broker envoyé.`;queueTradeCloseSync(latestGroup.id,closedChild.id,closeEvent.id,closeTelegramText);const sync=await flushTradeSyncQueue();if(sync.pending)showInAppNotice('Clôture conservée localement. Synchronisation cloud en attente ; nouvelle tentative automatique. Aucune notification Telegram ne partira avant confirmation cloud.',{type:'warning',duration:9000});
  }catch(error){showInAppNotice(error.message,{type:'error'});}
  finally{if(button)button.disabled=false;}
}
let announcementCache=[],announcementFilter='all';
function updateAnnouncementBadge(){const badge=$('announcementUnreadBadge');if(!badge)return;const count=announcementCache.filter(a=>!a.is_read).length;badge.textContent=count>99?'99+':String(count);badge.hidden=count===0;}
function renderAnnouncements(){const host=$('announcementList');if(!host)return;const items=announcementCache.filter(a=>announcementFilter==='all'||!a.is_read);updateAnnouncementBadge();document.querySelectorAll('[data-announcement-filter]').forEach(b=>b.classList.toggle('active',b.dataset.announcementFilter===announcementFilter));if(!items.length){host.innerHTML=`<div class="empty-cell">${announcementFilter==='unread'?'Aucune annonce non lue.':'Aucune annonce publiée pour le moment.'}</div>`;return;}const now=Date.now();host.innerHTML=items.map(a=>{const expired=a.ends_at&&Date.parse(a.ends_at)<now;const date=a.created_at?new Date(a.created_at).toLocaleString('fr-FR'):'Date inconnue';const url=typeof a.source_url==='string'&&/^https:\/\//i.test(a.source_url)?a.source_url:null;return `<article class="announcement-card ${a.is_read?'is-read':'is-unread'}"><div class="announcement-card-top"><span class="announcement-category">${escapeText(a.category||'Information')}</span><span class="announcement-state">${a.is_read?'Lue':'Non lue'}${expired?' · Archivée':''}</span></div><h3>${escapeText(a.title)}</h3><p>${escapeText(a.body).replace(/\n/g,'<br>')}</p><div class="announcement-meta"><span>${escapeText(date)}</span>${expired?'<span>Annonce expirée · conservée dans l’historique</span>':''}</div><div class="announcement-actions">${url?`<a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer">Consulter la source</a>`:''}${!a.is_read?`<button class="small-btn" type="button" data-announcement-read="${escapeText(a.id)}">Marquer comme lue</button>`:''}</div></article>`;}).join('');host.querySelectorAll('[data-announcement-read]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await markAnnouncementAsRead(btn.dataset.announcementRead);const item=announcementCache.find(a=>a.id===btn.dataset.announcementRead);if(item){item.is_read=true;item.read_at=new Date().toISOString();}renderAnnouncements();showInAppNotice('Annonce marquée comme lue.',{type:'success'});}catch(error){$('announcementStatus').textContent='Lecture non synchronisée : '+error.message;showInAppNotice('Impossible de synchroniser la lecture : '+error.message,{type:'error'});btn.disabled=false;}}));}
async function loadAnnouncements(){if(!window.__aureviaAuthenticated)return;const status=$('announcementStatus');if(status)status.textContent='Actualisation des annonces…';try{announcementCache=await loadPublishedAnnouncements();renderAnnouncements();if(status)status.textContent=`${announcementCache.length} annonce(s) publiée(s) · ${announcementCache.filter(a=>!a.is_read).length} non lue(s).`;}catch(error){if(status)status.textContent='Impossible de charger les annonces : '+error.message;const host=$('announcementList');if(host)host.innerHTML='<div class="empty-cell">Les annonces ne sont pas disponibles. Réessayez après vérification de votre connexion.</div>';}}
async function refreshAccountCurrency(){
 const notice=$('accountCurrencyNotice'),status=$('accountCurrencyStatus'),select=$('profileAccountCurrency'),risk=$('accountCurrency');
 try{accountCurrency=await loadAccountCurrency();if(select)select.value=accountCurrency||'';if(risk)risk.value=accountCurrency||'À configurer dans Paramètres';if(notice)notice.hidden=Boolean(accountCurrency);if(status)status.textContent=accountCurrency?`Devise enregistrée : ${accountCurrency}. Elle sera utilisée automatiquement.`:'Aucune devise enregistrée. Choisissez-la puis enregistrez.';return accountCurrency;}
 catch(error){if(status)status.textContent='Impossible de charger la devise : '+error.message;return null;}
}
async function persistAccountCurrency(){const button=$('saveAccountCurrency');try{const selected=$('profileAccountCurrency').value;if(!selected)throw new Error('Choisissez une devise avant de continuer.');if(!await confirmInApp({title:'Enregistrer la devise du compte ?',message:'La devise '+selected+' sera utilisée pour les calculs de risque et le suivi des positions.',confirmLabel:'Enregistrer la devise'}))return;if(button)button.disabled=true;const value=await saveAccountCurrency(selected);accountCurrency=value;if($('accountCurrency').value!==undefined)$('accountCurrency').value=value;if($('accountCurrencyNotice'))$('accountCurrencyNotice').hidden=true;if($('accountCurrencyStatus'))$('accountCurrencyStatus').textContent=`Devise enregistrée : ${value}.`;showInAppNotice(`Devise du compte enregistrée : ${value}.`,{type:'success'});}catch(error){if($('accountCurrencyStatus'))$('accountCurrencyStatus').textContent=error.message;showInAppNotice(error.message,{type:'error'});}finally{if(button)button.disabled=false;}}
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
  $('calculateRisk').addEventListener('click',async()=>{
    const button=$('calculateRisk');if(button)button.disabled=true;
    try{
      if(!accountCurrency)throw new Error('Renseignez la devise du compte dans Paramètres avant de calculer.');
      const instrument=$('riskInstrument').value,quoteCurrency=inferQuoteCurrency(instrument);
      if(!quoteCurrency)throw new Error('Devise de cotation inconnue pour cet instrument : conversion du risque impossible.');
      let quoteToAccount=1;
      if(quoteCurrency!==accountCurrency){
        const token=await getAnalysisAccessToken();if(!token)throw new Error('Session expirée. Reconnectez-vous pour récupérer le taux de conversion.');
        const response=await fetch(`/api/fx-rate?from=${encodeURIComponent(quoteCurrency)}&to=${encodeURIComponent(accountCurrency)}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
        const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Conversion ${quoteCurrency} → ${accountCurrency} indisponible.`);
        quoteToAccount=validateFxSnapshot(data,{from:quoteCurrency,to:accountCurrency}).rate;
      }
      const entry=Number($('entryPrice').value),stop=Number($('stopPrice').value),tp=Number($('takeProfit').value);
      const enteredDistance=Number($('slDistance').value);const distance=enteredDistance>0?enteredDistance:(entry>0&&stop>0?Math.abs(entry-stop):NaN);
      const reward=entry>0&&tp>0?Math.abs(tp-entry):null;
      const leverageValue=$('riskLeverage').value.trim()?Number($('riskLeverage').value):null;
      const result=calculatePositionRisk({balance:Number($('accountBalance').value),riskAmount:Number($('riskAmount').value),stopDistance:distance,unitValuePerLot:Number($('unitValue').value),quoteToAccount,lotStep:0.01,rewardDistance:reward,entryPrice:entry>0?entry:null,leverage:leverageValue});
      $('riskResult').textContent=result.error||`Calcul estimatif pour ${instrument} · ${result.lots.toFixed(2)} lot(s) · risque réellement engagé : ${result.riskMoney.toFixed(2)} ${accountCurrency}`;
      $('riskMoneyOut').textContent=result.error?'—':`${result.riskMoney.toFixed(2)} ${accountCurrency}`;$('lotsOut').textContent=result.error?'—':result.lots.toFixed(2);$('lossOut').textContent=result.error?'—':`${result.riskMoney.toFixed(2)} ${accountCurrency}`;$('gainOut').textContent=result.error||result.gain===null?'—':`${result.gain.toFixed(2)} ${accountCurrency}`;$('rrOut').textContent=result.error||result.rr===null?'—':`1:${result.rr.toFixed(2)}`;$('riskPctOut').textContent=result.error||result.riskPercentActual===null?'—':`${result.riskPercentActual.toFixed(2)} %`;$('marginOut').textContent=result.error||result.margin===null?'—':`${result.margin.toFixed(2)} ${accountCurrency}`;
    }catch(error){$('riskResult').textContent=error.message;for(const id of ['riskMoneyOut','lotsOut','lossOut','gainOut','rrOut','riskPctOut','marginOut'])$(id).textContent='—';}
    finally{if(button)button.disabled=false;}
  });
  $('savePositionEdit')?.addEventListener('click',async()=>{try{const group=loadTradeGroups().find(g=>g.id===$('editGroupId').value);if(!group)throw new Error('Position introuvable.');const childId=$('editChildId').value;if(childId){const entry=Number($('editEntry').value),stopLoss=Number($('editSL').value),takeProfit=Number($('editTP1').value);const child=group.children.find(c=>c.id===childId);if(!child)throw new Error('Trade introuvable.');if(!await confirmInApp({title:'Modifier ce trade séparé ?',message:group.instrument+' · '+child.tpLabel+'\nEntrée : '+entry+'\nStop Loss : '+stopLoss+'\nTake Profit : '+takeProfit+'\n\nSeul ce trade sera modifié.',confirmLabel:'Enregistrer ce trade'}))return;editSeparateTradeChild(group,childId,{entry,stopLoss,takeProfit});persistTradeGroup(group);$('editPositionDialog').close();renderPositions();try{queueTradeGroupSync(group.id);const result=await flushTradeSyncQueue();showInAppNotice(result.pending?'Trade modifié localement ; synchronisation cloud en attente et nouvelle tentative automatique.':'Trade modifié et synchronisé.',{type:result.pending?'info':'success'});}catch(error){showInAppNotice('Trade modifié localement, mais synchronisation cloud impossible : '+error.message,{type:'error'});}return;}const tps=group.children.map((_,i)=>Number($(`editTP${i+1}`).value));if(!await confirmInApp({title:'Confirmer la modification de cette position ?',message:group.instrument+'\nNouvelle entrée : '+$('editEntry').value+'\nNouveau Stop Loss : '+$('editSL').value+'\nNouveaux objectifs : '+tps.join(' · ')+'\n\nLes changements seront appliqués au suivi AUREVIA.',confirmLabel:'Enregistrer les modifications'}))return;editOpenTradeGroup(group,{entry:Number($('editEntry').value),stopLoss:Number($('editSL').value),takeProfits:tps});persistTradeGroup(group);$('editPositionDialog').close();renderPositions();showInAppNotice('Position modifiée localement. Synchronisation cloud en cours…',{type:'info'});try{queueTradeGroupSync(group.id);const result=await flushTradeSyncQueue();if(result.pending)showInAppNotice('Modification enregistrée localement ; synchronisation cloud en attente et nouvelle tentative automatique.',{type:'info'});else showInAppNotice('Modification de la position synchronisée.',{type:'success'});}catch(error){showInAppNotice(`Modification locale enregistrée, mais synchronisation cloud impossible : ${error.message}`,{type:'error'});}}catch(error){showInAppNotice(error.message,{type:'error'});}});
  $('addTradeBtn').addEventListener('click',()=>{const dialog=$('tradeDialog');$('tradeForm').reset();if(!dialog.open)dialog.showModal();});
  $('closeTradeDialog')?.addEventListener('click',()=>{$('tradeDialog').close('cancel');});
  $('tradeDialog')?.addEventListener('click',event=>{if(event.target===$('tradeDialog'))$('tradeDialog').close('cancel');});
  $('tradeDialog')?.addEventListener('cancel',()=>{$('tradeForm').reset();});
  $('tradeDialog')?.addEventListener('close',()=>{$('tradeForm').reset();});
  $('linkedJournalRows')?.addEventListener('click',async event=>{const btn=event.target.closest('[data-delete-linked-journal]');if(!btn)return;if(!await confirmInApp({title:'Supprimer cette fiche du journal ?',message:'Cette action supprime uniquement la fiche journal. La position et son suivi resteront inchangés.',confirmLabel:'Supprimer la fiche',danger:true}))return;try{const cloud=await deleteLinkedJournalEntryFromSupabase(btn.dataset.deleteLinkedJournal,btn.dataset.groupId||null,btn.dataset.childId||null);if(!cloud.synced&&cloud.reason!=='not_found')throw new Error('Connectez-vous pour confirmer la suppression cloud.');deleteLinkedJournalEntry(btn.dataset.localJournalId);renderLinkedJournal();renderJournalStats();showInAppNotice('Fiche supprimée du journal. Le suivi de position est conservé.',{type:'success'});}catch(error){showInAppNotice('Suppression de la fiche impossible : '+error.message,{type:'error'});}});
  $('journalRows')?.addEventListener('click',async event=>{const btn=event.target.closest('[data-delete-journal]');if(!btn)return;if(!await confirmInApp({title:'Supprimer cette entrée ?',message:'Supprimer définitivement cette entrée du journal local ?',confirmLabel:'Supprimer',danger:true}))return;const result=deleteJournalTrade(btn.dataset.deleteJournal);if(!result.ok){showInAppNotice(result.error);return;}renderJournal();renderJournalStats();showInAppNotice('Entrée supprimée du journal.',{type:'success'});});
  $('saveTrade').addEventListener('click',async()=>{
    if(!await confirmInApp({title:'Ajouter ce trade au journal ?',message:$('tradeInstrument').value+' · '+$('tradeDirection').value+'\nRésultat net : '+$('tradeResult').value+'\nDate : '+$('tradeDate').value+'\n\nCette entrée sera ajoutée à votre journal AUREVIA.',confirmLabel:'Ajouter au journal'}))return;
    const result=addJournalTrade({instrument:$('tradeInstrument').value,direction:$('tradeDirection').value,result:Number($('tradeResult').value),date:$('tradeDate').value,note:$('tradeNote').value});
    if(result.ok){sendTelegramNotification({type:'trade_close',text:`AUREVIA COPILOT · TRADE AJOUTÉ AU JOURNAL\n${$('tradeInstrument').value} · ${$('tradeDirection').value}\nRésultat net : ${Number($('tradeResult').value).toFixed(2)}\nDate : ${$('tradeDate').value}\nNote : ${$('tradeNote').value||'—'}`}).catch(()=>{});renderJournal();renderJournalStats();$('tradeDialog').close();$('tradeForm').reset();showInAppNotice('Trade ajouté au journal.',{type:'success'});}else showInAppNotice(result.error,{type:'error'});
  });
  $('settingsBtn').addEventListener('click',()=>document.querySelector('[data-page="parametres"]')?.click());
  document.querySelectorAll('[data-announcement-filter]').forEach(btn=>btn.addEventListener('click',()=>{announcementFilter=btn.dataset.announcementFilter;renderAnnouncements();}));
  $('announcementMarkAllRead')?.addEventListener('click',async event=>{
    const btn=event.currentTarget;
    const status=$('announcementStatus');
    if(btn.disabled)return;
    if(!await confirmInApp({title:'Marquer toutes les annonces comme lues ?',message:'Toutes les annonces actuellement non lues seront marquées comme lues sur votre compte.',confirmLabel:'Tout marquer comme lu'}))return;
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
      showInAppNotice(remaining===0?`${unread.length} annonce(s) marquée(s) comme lue(s).`:`Mise à jour partielle : ${remaining} annonce(s) restent non lues.`,{type:remaining===0?'success':'info'});
    }catch(error){
      if(status)status.textContent='Échec du marquage comme lu : '+(error?.message||'Erreur inconnue')+'. Actualisez la page ou reconnectez-vous.';
      showInAppNotice('Échec du marquage comme lu : '+(error?.message||'Erreur inconnue'),{type:'error'});
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
    const status=$('adminAnnouncementStatus');
    try{
      const endsValue=$('adminAnnouncementEndsAt').value,audience=$('adminAnnouncementAudience')?.value||'all';
      const recipientIds=audience==='selected'?[...adminSelectedAnnouncementRecipients.keys()]:[];
      if(audience==='selected'&&!recipientIds.length)throw new Error('Sélectionnez au moins un destinataire pour une annonce ciblée.');
      if(recipientIds.length>100)throw new Error('Une annonce ciblée est limitée à 100 destinataires.');
      const isPublished=$('adminAnnouncementPublish').checked,title=$('adminAnnouncementTitle').value.trim();
      if(!await confirmInApp({title:'Confirmer la création de cette annonce ?',message:(title||'Annonce sans titre')+'\nAudience : '+(audience==='selected'?recipientIds.length+' destinataire(s) sélectionné(s)':'tous les utilisateurs')+'\nPublication immédiate : '+(isPublished?'Oui':'Non')+'\n\n'+$('adminAnnouncementBody').value.trim().slice(0,300),confirmLabel:isPublished?'Créer et publier':'Créer le brouillon'}))return;
      status.textContent='Enregistrement…';
      const result=await adminRequest({action:'announcement_create',title:$('adminAnnouncementTitle').value,body:$('adminAnnouncementBody').value,category:$('adminAnnouncementCategory').value,source_url:$('adminAnnouncementUrl').value||null,ends_at:endsValue?new Date(endsValue).toISOString():null,is_published:isPublished,audience,recipient_ids:recipientIds});
      $('adminAnnouncementTitle').value='';$('adminAnnouncementBody').value='';$('adminAnnouncementEndsAt').value='';adminSelectedAnnouncementRecipients.clear();renderAnnouncementRecipientPicker();status.textContent=`Annonce ${audience==='selected'?'ciblée · '+(result.recipient_count||recipientIds.length)+' destinataire(s)':'générale · tous les utilisateurs'} enregistrée.`+(result.telegram?.status==='sent'||result.telegram?.status==='partial'||result.telegram?.status==='failed'?` Telegram : ${result.telegram.sent||0} envoyé(s), ${result.telegram.failed||0} échec(s).`:'');showInAppNotice('Annonce créée avec succès.',{type:'success'});await loadAdminConsole(adminPage,adminSearchValue);
    }catch(error){status.textContent=error.message;showInAppNotice(error.message,{type:'error'});}
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
  $('clearAnalysisHistory').addEventListener('click',async()=>{if(!await confirmInApp({title:'Effacer l’historique des confrontations ?',message:'Toutes les comparaisons enregistrées sur cet appareil seront supprimées. Cette action est irréversible.',confirmLabel:'Effacer l’historique',danger:true}))return;try{localStorage.removeItem('aurevia_analysis_history');renderAnalysisHistory();showInAppNotice('Historique des confrontations effacé.',{type:'success'});}catch(error){showInAppNotice('Impossible d’effacer l’historique : '+error.message,{type:'error'});}});
  $('createPositionBtn').addEventListener('click',createPositionFromForm);
  $('validationMode')?.addEventListener('change',updateValidationModeHelp);$('validationCalcType')?.addEventListener('change',updateValidationContractFields);$('confirmTradeValidation')?.addEventListener('click',confirmTradeValidation);$('cancelTradeValidation')?.addEventListener('click',()=>{pendingValidationScenario=null;$('validationTradeNav').hidden=true;document.querySelector('[data-page="marches"]')?.click();});updateValidationModeHelp();updateValidationContractFields();
  $('generateTelegramCode').addEventListener('click',async()=>{const generate=$('generateTelegramCode'),unlink=$('unlinkTelegramAccount'),save=$('saveTelegramPrefs'),test=$('sendTelegramTest');if(!await confirmInApp({title:'Générer un code de liaison Telegram ?',message:'AUREVIA va créer un code temporaire valable 10 minutes pour relier votre conversation privée avec @AureviaCopilotBot.',confirmLabel:'Générer le code'}))return;try{generate.disabled=true;$('telegramPairStatus').textContent='Génération du code…';const code=await createTelegramPairingCode();$('telegramPairCode').textContent=code;$('telegramPairStatus').textContent='Code valable 10 minutes. Envoyez /start '+code+' au bot officiel.';unlink.disabled=false;save.disabled=false;test.disabled=false;for(let attempt=0;attempt<10;attempt++){await new Promise(resolve=>setTimeout(resolve,2000));const connection=await loadTelegramPreferences();if(connection?.chat_id){$('telegramConnectionStatus').textContent='Telegram connecté · conversation privée vérifiée.';$('telegramPairStatus').textContent='Liaison confirmée. Vous pouvez enregistrer vos préférences et envoyer un test.';showInAppNotice('Liaison Telegram confirmée.',{type:'success'});break;}}await refreshTelegramHomeNotice();}catch(error){$('telegramPairStatus').textContent='Connexion Telegram impossible : '+error.message;showInAppNotice('Génération du code Telegram impossible : '+error.message,{type:'error'});}finally{generate.disabled=false;}});
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
  $('saveTelegramPrefs').addEventListener('click',async()=>{const prefs={all:$('notifyAll').checked,signals:$('notifySignals').checked,economic:$('notifyEconomic').checked,productAnnouncements:$('notifyProductAnnouncements').checked};if(!await confirmInApp({title:'Enregistrer les préférences Telegram ?',message:'Notifications générales : '+(prefs.all?'Activées':'Désactivées')+'\nSignaux : '+(prefs.signals?'Activés':'Désactivés')+'\nActualités économiques : '+(prefs.economic?'Activées':'Désactivées')+'\nAnnonces produit : '+(prefs.productAnnouncements?'Activées':'Désactivées'),confirmLabel:'Enregistrer les préférences'}))return;try{await saveTelegramPreferences(prefs);$('telegramConnectionStatus').textContent='Préférences enregistrées.';showInAppNotice('Préférences Telegram enregistrées.',{type:'success'});}catch(error){$('telegramConnectionStatus').textContent=error.message;showInAppNotice(error.message,{type:'error'});}});
  $('sendTelegramTest')?.addEventListener('click',async()=>{const status=$('telegramTestStatus');if(!await confirmInApp({title:'Envoyer un message de test Telegram ?',message:'AUREVIA enverra un message de vérification dans votre conversation privée avec @AureviaCopilotBot.',confirmLabel:'Envoyer le test'}))return;status.textContent='Envoi du test en cours…';$('sendTelegramTest').disabled=true;try{const result=await sendTelegramTest();if(!result.sent)throw new Error(result.reason||'Telegram n’a pas confirmé l’envoi.');status.textContent='Test accepté par Telegram. Vérifiez votre conversation avec @AureviaCopilotBot.';showInAppNotice('Message de test accepté par Telegram.',{type:'success'});}catch(error){status.textContent='Échec du test : '+error.message;showInAppNotice('Échec du test Telegram : '+error.message,{type:'error'});}finally{$('sendTelegramTest').disabled=false;}});
  $('posMode').addEventListener('change',()=>{$('posModeHelp').textContent=$('posMode').value==='unique'?'Position unique : le lot saisi est réparti entre les TP sélectionnés.':'Trades séparés : le lot saisi est appliqué individuellement à chaque TP sélectionné.';});
  const syncOrderFields=()=>{const type=$('posOrderType').value;const isBuy=type.startsWith('BUY '),isSell=type.startsWith('SELL '),isStop=type.includes('STOP'),isLimit=type.endsWith('LIMIT');if(isBuy||isSell)$('posDirection').value=isBuy?'BUY':'SELL';$('posTriggerWrap').hidden=!isStop;$('posLimitWrap').hidden=!(isLimit||type.includes('STOP LIMIT'));$('posExpiryWrap').hidden=type==='MARKET';$('posTrigger').required=isStop;$('posLimit').required=isLimit||type.includes('STOP LIMIT');$('posTrigger').disabled=!isStop;$('posLimit').disabled=!(isLimit||type.includes('STOP LIMIT'));$('posExpiry').disabled=type==='MARKET';$('posLimit').placeholder=type.includes('STOP LIMIT')?'Prix limite après déclenchement':'Prix d’entrée limite';};
  $('posOrderType').addEventListener('change',syncOrderFields);$('posDirection').addEventListener('change',()=>{const type=$('posOrderType').value;if(type!=='MARKET'&&((type.startsWith('BUY')&&$('posDirection').value==='SELL')||(type.startsWith('SELL')&&$('posDirection').value==='BUY')))$('posOrderType').value='MARKET';syncOrderFields();});syncOrderFields();
  $('reduceMotion').addEventListener('change',e=>{localStorage.setItem('aurevia_reduce_motion',e.target.checked?'1':'0');document.documentElement.classList.toggle('reduce-motion',e.target.checked);window.dispatchEvent(new CustomEvent('aurevia:motionchange',{detail:{reduced:e.target.checked}}));});
  $('reduceMotion').checked=localStorage.getItem('aurevia_reduce_motion')==='1';document.documentElement.classList.toggle('reduce-motion',$('reduceMotion').checked);initAppInstallation();
}
let authenticatedBooted=false;
function bootAuthenticatedApp(){if(authenticatedBooted||!window.__aureviaAuthenticated)return;authenticatedBooted=true;flushTradeSyncQueue();setInterval(()=>{if(window.__aureviaAuthenticated)flushTradeSyncQueue();},30000);refreshAccountCurrency();refreshTelegramHomeNotice();restoreMyAnalysis();refreshScenarioWatchList();setInterval(()=>{if(window.__aureviaAuthenticated)refreshScenarioWatchList();},60000);initJournal();renderJournal();renderPositions();renderLinkedJournal();setInterval(async()=>{if(!window.__aureviaAuthenticated)return;try{const restored=await restoreTradeGroupsFromSupabase();if(restored.restored){mergeRestoredTradeGroups(restored.groups,restored.journal);renderPositions();renderLinkedJournal();}}catch(error){console.warn('Actualisation du suivi cloud indisponible :',error.message);}},60000);initEconomicCalendar($('calendarStandalone'));syncMarketAvailability();mountTradingView();mountDxyChart();refreshSelectedQuote();$('chartStatus').textContent='Données en attente · lancez une analyse pour interroger Twelve Data';$('chartSource').textContent='TradingView · données OHLC chargées à la demande';$('signalState').textContent='WAIT';$('signalExplain').textContent='Aucune requête de marché au démarrage. Appuyez sur Analyser pour charger H4 / H1 / M30 / M15 / M5.';$('mtfRows').innerHTML='<tr><td colspan="4" class="empty-cell">En attente du lancement manuel de l’analyse.</td></tr>';syncMarketAvailability();}
function init(){bindEvents();bindPositionContractFields();updateClock();setInterval(updateClock,1000);if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(()=>{});initAuth().then(()=>{if(window.__aureviaAuthenticated)bootAuthenticatedApp();}).catch(error=>console.warn('Initialisation AUREVIA différée :',error?.message||error));}
init();
