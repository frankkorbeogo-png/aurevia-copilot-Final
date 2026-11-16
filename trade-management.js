import { calculateContractPnl, normalizeContractSpec, validateContractSpec } from './contract-engine.js';
const STORAGE_KEY = 'aurevia-position-groups-v2';
const JOURNAL_KEY = 'aurevia-linked-journal-v2';
const id = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);});
const round = (n, p=2) => Number(n.toFixed(p));


export function validatePendingOrderAgainstQuote({orderType,direction,entry,triggerPrice=null,marketPrice}){
  if(orderType==='MARKET')return {ok:true};
  const price=Number(marketPrice),level=Number(entry),trigger=Number(triggerPrice);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(level)||level<=0)return {ok:false,error:'Cours de marché indisponible : impossible de vérifier le placement de cet ordre en attente.'};
  if(orderType==='BUY LIMIT'&&price<=level)return {ok:false,error:`BUY LIMIT invalide : le cours actuel (${price}) doit être au-dessus de ton entrée (${level}).`};
  if(orderType==='SELL LIMIT'&&price>=level)return {ok:false,error:`SELL LIMIT invalide : le cours actuel (${price}) doit être sous ton entrée (${level}).`};
  if(orderType==='BUY STOP'&&price>=level)return {ok:false,error:`BUY STOP invalide : le cours actuel (${price}) doit être sous ton déclenchement (${level}).`};
  if(orderType==='SELL STOP'&&price<=level)return {ok:false,error:`SELL STOP invalide : le cours actuel (${price}) doit être au-dessus de ton déclenchement (${level}).`};
  if(orderType==='BUY STOP LIMIT'&&(!Number.isFinite(trigger)||trigger<=0||price>=trigger))return {ok:false,error:`BUY STOP LIMIT invalide : le cours actuel (${price}) doit être sous le déclenchement (${trigger}).`};
  if(orderType==='SELL STOP LIMIT'&&(!Number.isFinite(trigger)||trigger<=0||price<=trigger))return {ok:false,error:`SELL STOP LIMIT invalide : le cours actuel (${price}) doit être au-dessus du déclenchement (${trigger}).`};
  return {ok:true};
}

export function splitVolume(total, count, step=0.01) {
  if (![total,count,step].every(Number.isFinite) || total<=0 || count<1 || step<=0) throw new Error('Volume, nombre de TP et pas broker invalides.');
  const scaled=total/step;
  if(Math.abs(scaled-Math.round(scaled))>1e-7)throw new Error('Le volume total doit respecter le pas broker.');
  const units = Math.round(scaled);
  if (units < count) throw new Error('Le volume est insuffisant pour répartir au moins un pas broker par TP.');
  const base = Math.floor(units/count), remainder = units % count;
  const precision = Math.max(0, (String(step).split('.')[1]||'').length);
  return Array.from({length:count},(_,i)=>Number(((base+(i>=count-remainder?1:0))*step).toFixed(precision)));
}

export function createTradeGroup(input) {
  const {mode='unique', instrument, direction, lot, lotStep=0.01, entry, stopLoss, takeProfits=[], autoJournal=true, contractSize=null, quoteToAccount=1, feesPerLot=0, contractSpec=null, brokerSnapshot=null, orderType='MARKET', triggerPrice=null, limitPrice=null, expiresAt=null} = input;
  if (!instrument?.trim() || !['BUY','SELL'].includes(direction) || !Number.isFinite(lot) || lot<=0 || !Number.isFinite(entry) || entry<=0 || !Number.isFinite(stopLoss) || stopLoss<=0) throw new Error('Paramètres de position incomplets ou invalides.');
  if(!['unique','separate'].includes(mode)) throw new Error('Mode de gestion invalide.');
  if(!Number.isFinite(quoteToAccount)||quoteToAccount<=0||!Number.isFinite(feesPerLot)||feesPerLot<0) throw new Error('Conversion ou frais broker invalides.');
  if(contractSize!==null&&(!Number.isFinite(contractSize)||contractSize<=0)) throw new Error('La taille du contrat doit être positive.');
  const snapshot = contractSpec ? normalizeContractSpec(contractSpec) : null;
  const lotMin=snapshot?.minLot??0.01,lotStepFixed=snapshot?.lotStep??lotStep,lotMax=snapshot?.maxLot??null;
  if(!Number.isFinite(lotMin)||lotMin<=0||!Number.isFinite(lotStepFixed)||lotStepFixed<=0||(lotMax!==null&&(!Number.isFinite(lotMax)||lotMax<lotMin)))throw new Error('Spécifications de volume broker invalides.');
  if(lot<lotMin)throw new Error(`Le lot minimum autorisé est de ${lotMin}.`);
  if(lotMax!==null&&lot>lotMax)throw new Error(`Le lot maximum autorisé est de ${lotMax}.`);
  if(Math.abs(lot/lotStepFixed-Math.round(lot/lotStepFixed))>1e-7)throw new Error(`Le lot doit respecter le pas broker de ${lotStepFixed}.`);
  if(snapshot){const checked=validateContractSpec(snapshot);if(!checked.ok)throw new Error(checked.error);}
  const allowedOrders=['MARKET','BUY LIMIT','BUY STOP','BUY STOP LIMIT','SELL LIMIT','SELL STOP','SELL STOP LIMIT'];
  if(!allowedOrders.includes(orderType))throw new Error('Type d’ordre non reconnu.');
  if(orderType!=='MARKET'&&((orderType.startsWith('BUY')&&direction!=='BUY')||(orderType.startsWith('SELL')&&direction!=='SELL')))throw new Error('Le type d’ordre ne correspond pas à la direction BUY/SELL.');
  if(orderType.includes('STOP')&&(!Number.isFinite(triggerPrice)||triggerPrice<=0))throw new Error('Un ordre STOP ou STOP LIMIT exige un prix de déclenchement.');
  if(orderType.includes('STOP LIMIT')&&(!Number.isFinite(limitPrice)||limitPrice<=0))throw new Error('Un ordre STOP LIMIT exige aussi un prix limite.');
  if(orderType.endsWith('LIMIT')&&!orderType.includes('STOP LIMIT')&&limitPrice!==null&&(!Number.isFinite(limitPrice)||limitPrice<=0))throw new Error('Le prix limite doit être positif.');
  if((orderType==='BUY LIMIT'||orderType==='SELL LIMIT')&&limitPrice!==null&&Math.abs(limitPrice-entry)>1e-8)throw new Error('Pour un ordre LIMIT, le prix limite doit correspondre au prix d’entrée.');
  if(orderType.includes('STOP LIMIT')&&Math.abs(limitPrice-entry)>1e-8)throw new Error('Pour un STOP LIMIT, le prix d’entrée prévu doit correspondre au prix limite.');
  if(orderType==='BUY STOP LIMIT'&&limitPrice>triggerPrice)throw new Error('Pour un BUY STOP LIMIT, le prix limite doit être inférieur ou égal au déclenchement.');
  if(orderType==='SELL STOP LIMIT'&&limitPrice<triggerPrice)throw new Error('Pour un SELL STOP LIMIT, le prix limite doit être supérieur ou égal au déclenchement.');
  const tps = takeProfits.filter(x=>x?.enabled!==false && Number.isFinite(Number(x.price)) && Number(x.price)>0).map(x=>({label:x.label||`TP`,price:Number(x.price)}));
  if(direction==='BUY'&&stopLoss>=entry)throw new Error('Pour un BUY, le stop-loss doit être sous le prix d’entrée.');
  if(direction==='SELL'&&stopLoss<=entry)throw new Error('Pour un SELL, le stop-loss doit être au-dessus du prix d’entrée.');
  if(tps.some(tp=>direction==='BUY'?tp.price<=entry:tp.price>=entry))throw new Error('Les take-profits doivent être du côté favorable de l’entrée.');
  if (!tps.length) throw new Error('Sélectionnez au moins un take-profit.');
  const volumes = mode==='unique' ? splitVolume(lot,tps.length,lotStepFixed) : tps.map(()=>lot);
  if(volumes.some(volume=>volume<lotMin||(lotMax!==null&&volume>lotMax)))throw new Error('La répartition des TP ne respecte pas les limites de volume broker.');
  const groupId=id();
  const createdAt=new Date().toISOString();
  const initialStatus=orderType==='MARKET'?'OPEN':'PENDING';
  const children=tps.map((tp,i)=>({id:id(),groupId,instrument,direction,mode,lot:volumes[i],initialLot:volumes[i],remainingLot:volumes[i],entry,stopLoss,takeProfit:tp.price,tpLabel:tp.label,status:initialStatus,triggerSeen:false,activatedAt:orderType==='MARKET'?createdAt:null,activationPrice:orderType==='MARKET'?entry:null,realizedPnl:0,fees:0,closes:[],createdAt}));
  const effectiveLimitPrice = orderType.endsWith('LIMIT') && !orderType.includes('STOP LIMIT') ? (limitPrice ?? entry) : limitPrice;
  if(expiresAt){const expiry=new Date(expiresAt);if(Number.isNaN(expiry.getTime())||expiry.getTime()<=Date.now())throw new Error('La date d’expiration doit être valide et située dans le futur.');if(orderType==='MARKET')throw new Error('Une position au marché ne possède pas de date d’expiration d’ordre en attente.');}
  const group={id:groupId,instrument,direction,mode,orderType,triggerPrice,limitPrice:effectiveLimitPrice,expiresAt:expiresAt?new Date(expiresAt).toISOString():null,requestedLot:lot,lotStep:lotStepFixed,children,autoJournal:Boolean(autoJournal),contractSpec:snapshot,brokerSnapshot:brokerSnapshot?{...brokerSnapshot}:snapshot?{brokerName:snapshot.brokerName,accountType:snapshot.accountType,accountCurrency:snapshot.accountCurrency,leverage:snapshot.leverage}:null,contractSize:snapshot?.contractSize??contractSize,quoteToAccount:snapshot?.quoteToAccount??quoteToAccount,feesPerLot:snapshot?.feesPerLot??feesPerLot,status:'OPEN',createdAt};
  return group;
}

export function buildTradeGroupCloudRows(group,userId){
  if(!group?.id||!userId||!['unique','separate'].includes(group.mode)||!Array.isArray(group.children)||!group.children.length)throw new Error('Groupe de trades invalide pour la synchronisation cloud.');
  const groupRow={id:group.id,user_id:userId,mode:group.mode,instrument:group.instrument,direction:group.direction,order_type:group.orderType||'MARKET',requested_volume:group.requestedLot,lot_step:group.lotStep||0.01,auto_journal:Boolean(group.autoJournal),status:group.status||'OPEN',contract_spec:group.contractSpec||null,broker_snapshot:group.brokerSnapshot||null,created_at:group.createdAt};
  const positions=group.children.map(child=>({id:child.id,group_id:group.id,user_id:userId,tp_label:child.tpLabel,entry_price:child.entry,stop_loss:child.stopLoss,take_profit:child.takeProfit,trigger_price:group.triggerPrice,limit_price:group.limitPrice,volume_initial:child.initialLot,volume_remaining:child.remainingLot,contract_size:group.contractSize,quote_to_account:group.quoteToAccount,fees_per_lot:group.feesPerLot,contract_spec:group.contractSpec||null,status:child.status,trigger_seen:Boolean(child.triggerSeen),activated_at:child.activatedAt||null,activation_price:child.activationPrice??null,opened_at:group.createdAt||child.createdAt}));
  let journalRows=[];
  if(group.autoJournal){
    if(group.mode==='unique'){
      const first=group.children[0],pending=group.children.every(child=>child.status==='PENDING');
      journalRows=[{user_id:userId,instrument:group.instrument,direction:group.direction,result:'OPEN',pnl:0,notes:`Position unique AUREVIA · clôtures partielles liées${pending?' · ordre en attente d’activation':''}`,group_id:group.id,mode:'unique',volume_initial:group.requestedLot,volume_remaining:group.children.reduce((sum,child)=>sum+Number(child.remainingLot||0),0),gross_pnl:0,fees:0,entry_price:first.entry,stop_loss:first.stopLoss,take_profit:first.takeProfit,created_at:group.createdAt}];
    }else{
      journalRows=group.children.map(child=>({user_id:userId,instrument:group.instrument,direction:group.direction,result:'OPEN',pnl:0,notes:`Trade séparé AUREVIA · ${child.tpLabel}${child.status==='PENDING'?' · ordre en attente d’activation':''}`,group_id:group.id,position_id:child.id,mode:'separate',volume_initial:child.initialLot,volume_remaining:child.remainingLot,tp_label:child.tpLabel,gross_pnl:0,fees:0,entry_price:child.entry,stop_loss:child.stopLoss,take_profit:child.takeProfit,created_at:group.createdAt}));
    }
  }
  return {groupRow,positions,journalRows};
}

export function calculateClosePnl({direction,entry,exit,volume,contractSize,quoteToAccount=1,fees=0,contractSpec=null}) {
  const result=calculateContractPnl({direction,entry,exit,volume,contractSpec,contractSize,quoteToAccount,fees});
  return result.currency?{gross:result.gross,fees:result.fees,net:result.net,currency:result.currency}:{gross:result.gross,fees:result.fees,net:result.net};
}

export function recordPartialClose(group, childId, {volume,exit,contractSize=group.contractSize,quoteToAccount=group.quoteToAccount??1,feesPerLot=group.feesPerLot??0,contractSpec=group.contractSpec||null,fees=null,fxSnapshot=null}) {
  const child=group.children.find(x=>x.id===childId);
  if(!child || child.status!=='OPEN') throw new Error(child?.status==='PENDING'?'Le trade est encore en attente de son prix d’entrée.':'Position introuvable ou déjà clôturée.');
  if(!Number.isFinite(volume)||volume<=0||volume>child.remainingLot+1e-9) throw new Error('Le volume clôturé doit être positif et ne peut pas dépasser le volume restant.');
  if(group.lotStep&&Math.abs(volume/group.lotStep-Math.round(volume/group.lotStep))>1e-7)throw new Error('Le volume clôturé ne respecte pas le pas broker.');
  if(!contractSpec&&(!Number.isFinite(contractSize)||contractSize<=0))throw new Error('Renseignez les spécifications contractuelles du broker avant de calculer le résultat réel.');
  const feeAmount=fees===null?volume*(contractSpec?.feesPerLot??feesPerLot):fees;
  const pnl=calculateClosePnl({direction:child.direction,entry:child.entry,exit,volume,contractSize,quoteToAccount,fees:feeAmount,contractSpec});
  child.closes.push({id:id(),volume,exit,...pnl,...(fxSnapshot?{fxSnapshot}:{}),closedAt:new Date().toISOString()});
  child.remainingLot=round(Math.max(0,child.remainingLot-volume),8);
  child.realizedPnl=round(child.realizedPnl+pnl.net,2); child.fees=round(child.fees+pnl.fees,2);
  if(child.remainingLot<=1e-8){child.remainingLot=0;child.status='CLOSED';child.closedAt=new Date().toISOString();}
  group.status=group.children.every(x=>x.status==='CLOSED')?'CLOSED':'OPEN';
  return {group,child,pnl};
}

export function resolveLinkedJournalStatus(row, group) {
  if (row?.result && ['WIN','LOSS','BREAKEVEN'].includes(row.result)) return 'CLOSED';
  if (row?.result === 'OPEN') {
    const children = row.position_id
      ? (group?.children || []).filter(child => child.id === row.position_id)
      : (group?.children || []);
    if (children.length && children.every(child => child.status === 'PENDING')) return 'PENDING';
    if (children.length && children.every(child => child.status === 'CLOSED')) return 'CLOSED';
    return 'OPEN';
  }
  return row?.result === 'PENDING' ? 'PENDING' : 'CLOSED';
}

export function groupSummary(group) {
  const realized=round(group.children.reduce((s,c)=>s+c.realizedPnl,0),2);
  const remaining=round(group.children.reduce((s,c)=>s+c.remainingLot,0),8);
  return {realized,remaining,closed:group.children.filter(c=>c.status==='CLOSED').length,total:group.children.length,status:group.status};
}

function read(key){try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function saveTradeGroup(group){const rows=read(STORAGE_KEY);rows.unshift(group);if(!write(STORAGE_KEY,rows))throw new Error('Stockage local indisponible.');if(group.autoJournal){const journal=read(JOURNAL_KEY);if(group.mode==='unique'){journal.unshift({id:id(),groupId:group.id,mode:'unique',instrument:group.instrument,direction:group.direction,childIds:group.children.map(c=>c.id),createdAt:group.createdAt,realizedPnl:0,status:group.children.some(c=>c.status==='OPEN')?'OPEN':'PENDING'});}else{for(const child of group.children)journal.unshift({id:id(),groupId:group.id,childId:child.id,mode:'separate',instrument:group.instrument,direction:group.direction,tpLabel:child.tpLabel,takeProfit:child.takeProfit,lot:child.lot,createdAt:group.createdAt,realizedPnl:0,status:child.status==='PENDING'?'PENDING':'OPEN'});}if(!write(JOURNAL_KEY,journal)){write(STORAGE_KEY,rows.filter(x=>x.id!==group.id));throw new Error('Impossible de créer la fiche journal liée ; la position n’a pas été conservée.');}}return group;}
export function loadTradeGroups(){return read(STORAGE_KEY);}
export function persistTradeGroup(updated){
  const rows=read(STORAGE_KEY),i=rows.findIndex(x=>x.id===updated.id);
  if(i<0)throw new Error('Groupe de positions introuvable.');
  const previousRows=rows.slice(), previousJournal=read(JOURNAL_KEY);
  rows[i]=updated;
  if(!write(STORAGE_KEY,rows))throw new Error('Stockage local indisponible.');
  const journal=previousJournal.map(item=>{
    if(item.groupId!==updated.id)return item;
    if(updated.mode==='unique'&&!item.childId){
      const summary=groupSummary(updated);
      return {...item,instrument:updated.instrument,direction:updated.direction,entry:updated.children[0]?.entry,stopLoss:updated.children[0]?.stopLoss,takeProfits:updated.children.map(c=>({label:c.tpLabel,price:c.takeProfit})),realizedPnl:summary.realized,remainingLot:summary.remaining,status:updated.children.some(c=>c.status==='OPEN')?'OPEN':updated.children.some(c=>c.status==='PENDING')?'PENDING':summary.status,updatedAt:new Date().toISOString()};
    }
    const child=updated.children.find(c=>c.id===item.childId);
    return child?{...item,instrument:updated.instrument,direction:updated.direction,entry:child.entry,stopLoss:child.stopLoss,takeProfit:child.takeProfit,lot:child.initialLot,remainingLot:child.remainingLot,realizedPnl:child.realizedPnl,fees:child.fees,status:child.status,closes:child.closes,updatedAt:new Date().toISOString()}:item;
  });
  if(!write(JOURNAL_KEY,journal)){
    write(STORAGE_KEY,previousRows);
    throw new Error('Synchronisation du journal impossible : la position a été restaurée à son état précédent.');
  }
  return updated;
}
export function loadLinkedJournal(){return read(JOURNAL_KEY);}
export function attachCloudJournalIds(groupId,mappings=[]){
  const ids=new Map((mappings||[]).map(row=>[row.positionId||'parent',row.id]));
  const rows=read(JOURNAL_KEY).map(row=>row.groupId===groupId&&ids.has(row.childId||'parent')?{...row,cloudId:ids.get(row.childId||'parent')}:row);
  if(!write(JOURNAL_KEY,rows))throw new Error('Impossible d’associer les identifiants cloud aux fiches journal locales.');
  return true;
}


export function mergeRestoredTradeGroups(cloudGroups, cloudJournal=[]){
  const local=read(STORAGE_KEY),byId=new Map(local.map(g=>[g.id,g]));
  for(const group of cloudGroups||[])byId.set(group.id,group);
  const merged=[...byId.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(!write(STORAGE_KEY,merged))throw new Error('Impossible de restaurer les positions dans le stockage local.');
  const journal=read(JOURNAL_KEY),cloudIds=new Set((cloudJournal||[]).map(x=>x.cloudId||x.id));
  const cloudKeys=new Set((cloudJournal||[]).map(x=>`${x.groupId}:${x.childId||'parent'}`));
  const localOnly=journal.filter(x=>!cloudIds.has(x.cloudId||x.id)&&!cloudKeys.has(`${x.groupId}:${x.childId||'parent'}`));
  const mapped=(cloudJournal||[]).map(x=>({...x,id:x.cloudId||x.id}));
  if(!write(JOURNAL_KEY,[...mapped,...localOnly]))throw new Error('Positions restaurées, mais le journal local n’a pas pu être restauré.');
  return merged;
}

export function deleteOpenTradeGroup(groupId){
  const group=read(STORAGE_KEY).find(x=>x.id===groupId);
  if(!group)throw new Error('Position introuvable.');
  throw new Error('Une position doit être entièrement clôturée avant de pouvoir être retirée du suivi.');
}

export function deletePendingTradeGroup(groupId){
  const rows=read(STORAGE_KEY),group=rows.find(item=>item.id===groupId);
  if(!group||group.mode!=='unique')throw new Error('Cette action est réservée aux positions uniques.');
  if(!group.children.length||group.children.some(child=>child.status!=='PENDING'||Number(child.remainingLot)!==Number(child.initialLot)||(child.closes||[]).length))throw new Error('Une position unique ne peut être supprimée que si tous ses trades sont encore en attente et sans clôture.');
  const journal=read(JOURNAL_KEY),nextJournal=journal.filter(row=>row.groupId!==groupId);
  if(!write(STORAGE_KEY,rows.filter(item=>item.id!==groupId)))throw new Error('Impossible de supprimer la position en attente.');
  if(!write(JOURNAL_KEY,nextJournal)){write(STORAGE_KEY,rows);throw new Error('La fiche journal n’a pas pu être supprimée ; la position a été restaurée.');}
  return true;
}

export function deleteClosedTradeGroup(groupId){
  const rows=read(STORAGE_KEY),group=rows.find(x=>x.id===groupId);
  if(!group)throw new Error('Groupe de positions introuvable.');
  if(group.status!=='CLOSED'||!group.children.length||group.children.some(c=>c.status!=='CLOSED'||Number(c.remainingLot)>1e-8||(c.closes||[]).length===0))throw new Error('Seul un groupe entièrement clôturé peut être supprimé du suivi.');
  if(!write(STORAGE_KEY,rows.filter(x=>x.id!==groupId)))throw new Error('Impossible de supprimer la position locale.');
  return true;
}

export function deleteLinkedJournalEntry(journalId){
  const rows=read(JOURNAL_KEY),next=rows.filter(row=>String(row.id)!==String(journalId)&&String(row.cloudId||'')!==String(journalId));
  if(next.length===rows.length)throw new Error('Fiche journal introuvable.');
  if(!write(JOURNAL_KEY,next))throw new Error('Impossible de supprimer cette fiche du journal local.');
  return true;
}

export function editSeparateTradeChild(group, childId, {entry,stopLoss,takeProfit}){
  if(!group||group.mode!=='separate')throw new Error('Cette action est réservée au mode Trades séparés.');
  const child=group.children.find(item=>item.id===childId);
  if(!child)throw new Error('Trade introuvable.');
  if(!['OPEN','PENDING'].includes(child.status)||(child.closes||[]).length)throw new Error('Un trade déjà clôturé ou ayant une clôture enregistrée ne peut plus être modifié.');
  if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(stopLoss)||stopLoss<=0||!Number.isFinite(takeProfit)||takeProfit<=0)throw new Error('Entrée, Stop Loss et TP doivent être des prix positifs.');
  if(group.direction==='BUY'&&(stopLoss>=entry||takeProfit<=entry))throw new Error('Pour un BUY, le SL doit être sous l’entrée et le TP au-dessus.');
  if(group.direction==='SELL'&&(stopLoss<=entry||takeProfit>=entry))throw new Error('Pour un SELL, le SL doit être au-dessus de l’entrée et le TP sous l’entrée.');
  child.entry=entry;child.stopLoss=stopLoss;child.takeProfit=takeProfit;group.updatedAt=new Date().toISOString();return child;
}

export function deletePendingSeparateTradeChild(groupId,childId){
  const rows=read(STORAGE_KEY),group=rows.find(item=>item.id===groupId);
  if(!group||group.mode!=='separate')throw new Error('Cette action est réservée au mode Trades séparés.');
  const child=group.children.find(item=>item.id===childId);
  if(!child)throw new Error('Trade introuvable.');
  if(child.status!=='PENDING'||Number(child.remainingLot)!==Number(child.initialLot)||(child.closes||[]).length)throw new Error('Seul un trade encore en attente, sans clôture, peut être supprimé.');
  const nextJournal=read(JOURNAL_KEY).filter(row=>!(row.groupId===groupId&&row.childId===childId));
  const nextChildren=group.children.filter(item=>item.id!==childId);
  const nextGroups=nextChildren.length?rows.map(item=>item.id===groupId?{...group,children:nextChildren,requestedLot:nextChildren.reduce((sum,item)=>sum+Number(item.initialLot||0),0),updatedAt:new Date().toISOString()}:item):rows.filter(item=>item.id!==groupId);
  if(!write(STORAGE_KEY,nextGroups))throw new Error('Impossible de supprimer le trade en attente.');
  if(!write(JOURNAL_KEY,nextJournal)){write(STORAGE_KEY,rows);throw new Error('La fiche journal n’a pas pu être supprimée ; le trade a été restauré.');}
  return {groupDeleted:!nextChildren.length};
}

export function deleteSeparateTradeChild(groupId, childId){
  const rows=read(STORAGE_KEY),group=rows.find(item=>item.id===groupId);
  if(!group||group.mode!=='separate')throw new Error('Cette action est réservée au mode Trades séparés.');
  const child=group.children.find(item=>item.id===childId);
  if(!child)throw new Error('Trade introuvable.');
  if(child.status!=='CLOSED'||Number(child.remainingLot)>1e-8||!(child.closes||[]).length)throw new Error('Un trade séparé doit être entièrement clôturé avant de pouvoir être retiré du suivi.');
  group.children=group.children.filter(item=>item.id!==childId);
  if(!group.children.length){if(!write(STORAGE_KEY,rows.filter(item=>item.id!==groupId)))throw new Error('Impossible de supprimer le dernier trade du groupe.');return {groupDeleted:true,group};}
  group.requestedLot=group.children.reduce((sum,item)=>sum+Number(item.initialLot||0),0);
  group.status=group.children.every(item=>item.status==='CLOSED')?'CLOSED':'OPEN';
  group.updatedAt=new Date().toISOString();
  if(!write(STORAGE_KEY,rows))throw new Error('Impossible d’enregistrer la suppression du trade.');
  return {groupDeleted:false,group};
}

export function editOpenTradeGroup(group, {entry,stopLoss,takeProfits}){
  if(!group||group.mode!=='unique')throw new Error('Cette action est réservée au mode Position unique.');
  if(group.status!=='OPEN'||!group.children.length||group.children.some(c=>!['OPEN','PENDING'].includes(c.status)||(c.closes||[]).length))throw new Error('Seul un groupe ouvert en mode Position unique, sans clôture enregistrée, peut être modifié.');
  if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(stopLoss)||stopLoss<=0)throw new Error('Prix d’entrée et Stop Loss invalides.');
  if(group.direction==='BUY'&&stopLoss>=entry)throw new Error('Pour un BUY, le Stop Loss doit rester sous l’entrée.');
  if(group.direction==='SELL'&&stopLoss<=entry)throw new Error('Pour un SELL, le Stop Loss doit rester au-dessus de l’entrée.');
  if(!Array.isArray(takeProfits)||takeProfits.length!==group.children.length||takeProfits.some(v=>!Number.isFinite(v)||v<=0||(group.direction==='BUY'?v<=entry:v>=entry)))throw new Error('Chaque TP doit être valide et rester du côté favorable de l’entrée.');
  group.children.forEach((child,i)=>{child.entry=entry;child.stopLoss=stopLoss;child.takeProfit=takeProfits[i];});
  group.updatedAt=new Date().toISOString();return group;
}
