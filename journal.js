const KEY='aurevia-copilot-journal-v1';
function read(){try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function write(rows){try{localStorage.setItem(KEY,JSON.stringify(rows));return true;}catch{return false;}}
export function initJournal(){read();}
export function loadJournalTrades(){return read();}
export function deleteJournalTrade(tradeId){const rows=read();const next=rows.filter(row=>row.id!==tradeId);if(next.length===rows.length)return {ok:false,error:'Trade introuvable.'};return write(next)?{ok:true}:{ok:false,error:'Suppression impossible : stockage local indisponible.'};}
export function addJournalTrade(trade){
  if(!trade.instrument?.trim()||!['BUY','SELL'].includes(trade.direction)||!Number.isFinite(trade.result)||!trade.date)return {ok:false,error:'Renseignez un instrument, une direction, un résultat numérique et une date.'};
  const rows=read();rows.unshift({...trade,id:crypto.randomUUID?.()||String(Date.now()),createdAt:new Date().toISOString()});
  return write(rows)?{ok:true}:{ok:false,error:'Le stockage local est indisponible sur cet appareil.'};
}
export function renderJournal(){
  const rows=read(),wins=rows.filter(r=>Number(r.result)>0).length,losses=rows.filter(r=>Number(r.result)<0).length,closed=rows.filter(r=>Number(r.result)!==0).length,net=rows.reduce((s,r)=>s+Number(r.result||0),0);
  const count=document.getElementById('journalCount');if(!count)return;
  count.textContent=rows.length;document.getElementById('journalWins').textContent=wins;
  const lossNode=document.getElementById('journalLosses');if(lossNode)lossNode.textContent=losses;
  document.getElementById('journalWinRate').textContent=closed?`${(wins/closed*100).toFixed(1)} %`:'—';
  document.getElementById('journalNet').textContent=net.toFixed(2);
  document.getElementById('journalRows').innerHTML=rows.length?rows.slice(0,30).map(r=>`<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.instrument)}</td><td>${escapeHtml(r.direction)}</td><td class="${r.result>=0?'good':'bad'}">${Number(r.result).toFixed(2)}</td><td>${escapeHtml(r.note||'—')}</td><td><button class="small-btn" data-delete-journal="${escapeHtml(r.id)}" type="button">Supprimer</button></td></tr>`).join(''):'<tr><td class="empty-cell" colspan="6">Aucun trade enregistré.</td></tr>';
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
