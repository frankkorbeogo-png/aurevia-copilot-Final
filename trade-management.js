const STORAGE_KEY = 'aurevia-position-groups-v2';
const JOURNAL_KEY = 'aurevia-linked-journal-v2';
const id = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);});
const round = (n, p=2) => Number(n.toFixed(p));

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
  const {mode='unique', instrument, direction, lot, lotStep=0.01, entry, stopLoss, takeProfits=[], autoJournal=true, contractSize=null, quoteToAccount=1, feesPerLot=0, orderType='MARKET', triggerPrice=null, limitPrice=null} = input;
  if (!instrument?.trim() || !['BUY','SELL'].includes(direction) || !Number.isFinite(lot) || lot<=0 || !Number.isFinite(entry) || entry<=0 || !Number.isFinite(stopLoss) || stopLoss<=0) throw new Error('Paramètres de position incomplets ou invalides.');
  if(!['unique','separate'].includes(mode)) throw new Error('Mode de gestion invalide.');
  if(!Number.isFinite(lotStep)||lotStep<=0) throw new Error('Le pas de volume broker doit être strictement positif.');
  if(Math.abs(lot/lotStep-Math.round(lot/lotStep))>1e-7) throw new Error('Le lot saisi ne respecte pas le pas de volume du broker.');
  if(!Number.isFinite(quoteToAccount)||quoteToAccount<=0||!Number.isFinite(feesPerLot)||feesPerLot<0) throw new Error('Conversion ou frais broker invalides.');
  if(contractSize!==null&&(!Number.isFinite(contractSize)||contractSize<=0)) throw new Error('La taille du contrat doit être positive.');
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
  const volumes = mode==='unique' ? splitVolume(lot,tps.length,lotStep) : tps.map(()=>lot);
  const groupId=id();
  const children=tps.map((tp,i)=>({id:id(),groupId,instrument,direction,mode,lot:volumes[i],initialLot:volumes[i],remainingLot:volumes[i],entry,stopLoss,takeProfit:tp.price,tpLabel:tp.label,status:'OPEN',realizedPnl:0,fees:0,closes:[],createdAt:new Date().toISOString()}));
  const effectiveLimitPrice = orderType.endsWith('LIMIT') && !orderType.includes('STOP LIMIT') ? (limitPrice ?? entry) : limitPrice;
  const group={id:groupId,instrument,direction,mode,orderType,triggerPrice,limitPrice:effectiveLimitPrice,requestedLot:lot,lotStep,children,autoJournal:Boolean(autoJournal),contractSize,quoteToAccount,feesPerLot,status:'OPEN',createdAt:new Date().toISOString()};
  return group;
}

export function calculateClosePnl({direction,entry,exit,volume,contractSize,quoteToAccount=1,fees=0}) {
  if(!['BUY','SELL'].includes(direction) || ![entry,exit,volume,contractSize,quoteToAccount,fees].every(Number.isFinite) || entry<=0 || exit<=0 || volume<=0 || contractSize<=0 || quoteToAccount<=0 || fees<0) throw new Error('Données de clôture ou spécifications contractuelles invalides.');
  const move=(direction==='BUY'?exit-entry:entry-exit);
  const gross=move*volume*contractSize*quoteToAccount;
  return {gross:round(gross,2),fees:round(fees,2),net:round(gross-fees,2)};
}

export function recordPartialClose(group, childId, {volume,exit,contractSize=group.contractSize,quoteToAccount=group.quoteToAccount??1,feesPerLot=group.feesPerLot??0,fees=null}) {
  const child=group.children.find(x=>x.id===childId);
  if(!child || child.status!=='OPEN') throw new Error('Position introuvable ou déjà clôturée.');
  if(!Number.isFinite(volume)||volume<=0||volume>child.remainingLot+1e-9) throw new Error('Le volume clôturé doit être positif et ne peut pas dépasser le volume restant.');
  if(group.lotStep&&Math.abs(volume/group.lotStep-Math.round(volume/group.lotStep))>1e-7)throw new Error('Le volume clôturé ne respecte pas le pas broker.');
  if(!Number.isFinite(contractSize)||contractSize<=0)throw new Error('Renseignez la taille du contrat du broker avant de calculer le résultat réel.');
  const feeAmount=fees===null?volume*feesPerLot:fees;
  const pnl=calculateClosePnl({direction:child.direction,entry:child.entry,exit,volume,contractSize,quoteToAccount,fees:feeAmount});
  child.closes.push({id:id(),volume,exit, ...pnl,closedAt:new Date().toISOString()});
  child.remainingLot=round(Math.max(0,child.remainingLot-volume),8);
  child.realizedPnl=round(child.realizedPnl+pnl.net,2); child.fees=round(child.fees+pnl.fees,2);
  if(child.remainingLot<=1e-8){child.remainingLot=0;child.status='CLOSED';child.closedAt=new Date().toISOString();}
  group.status=group.children.every(x=>x.status==='CLOSED')?'CLOSED':'OPEN';
  return {group,child,pnl};
}

export function groupSummary(group) {
  const realized=round(group.children.reduce((s,c)=>s+c.realizedPnl,0),2);
  const remaining=round(group.children.reduce((s,c)=>s+c.remainingLot,0),8);
  return {realized,remaining,closed:group.children.filter(c=>c.status==='CLOSED').length,total:group.children.length,status:group.status};
}

function read(key){try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function saveTradeGroup(group){const rows=read(STORAGE_KEY);rows.unshift(group);if(!write(STORAGE_KEY,rows))throw new Error('Stockage local indisponible.');if(group.autoJournal){const journal=read(JOURNAL_KEY);if(group.mode==='unique'){journal.unshift({id:id(),groupId:group.id,mode:'unique',instrument:group.instrument,direction:group.direction,childIds:group.children.map(c=>c.id),createdAt:group.createdAt,realizedPnl:0,status:'OPEN'});}else{for(const child of group.children)journal.unshift({id:id(),groupId:group.id,childId:child.id,mode:'separate',instrument:group.instrument,direction:group.direction,tpLabel:child.tpLabel,takeProfit:child.takeProfit,lot:child.lot,createdAt:group.createdAt,realizedPnl:0,status:'OPEN'});}if(!write(JOURNAL_KEY,journal)){write(STORAGE_KEY,rows.filter(x=>x.id!==group.id));throw new Error('Impossible de créer la fiche journal liée ; la position n’a pas été conservée.');}}return group;}
export function loadTradeGroups(){return read(STORAGE_KEY);}
export function persistTradeGroup(updated){const rows=read(STORAGE_KEY),i=rows.findIndex(x=>x.id===updated.id);if(i<0)throw new Error('Groupe de positions introuvable.');rows[i]=updated;if(!write(STORAGE_KEY,rows))throw new Error('Stockage local indisponible.');const journal=read(JOURNAL_KEY);if(updated.mode==='unique'){const item=journal.find(x=>x.groupId===updated.id&&!x.childId);if(item){const s=groupSummary(updated);item.realizedPnl=s.realized;item.status=s.status;}}else{for(const child of updated.children){const item=journal.find(x=>x.groupId===updated.id&&x.childId===child.id);if(item){item.realizedPnl=child.realizedPnl;item.status=child.status;}}}if(!write(JOURNAL_KEY,journal))throw new Error('Position mise à jour, mais la synchronisation du journal local a échoué.');return updated;}
export function loadLinkedJournal(){return read(JOURNAL_KEY);}
