import test from 'node:test';
import assert from 'node:assert/strict';
import {splitVolume,createTradeGroup,validatePendingOrderAgainstQuote,buildTradeGroupCloudRows,calculateClosePnl,recordPartialClose,groupSummary,resolveLinkedJournalStatus,editSeparateTradeChild,deleteSeparateTradeChild,deletePendingTradeGroup,deletePendingSeparateTradeChild,deleteClosedTradeGroup,deleteLinkedJournalEntry,persistTradeGroup,loadTradeGroups,saveTradeGroup,loadLinkedJournal} from '../trade-management.js';

test('position unique répartit le volume total en respectant le pas',()=>assert.deepEqual(splitVolume(.10,3,.01),[.03,.03,.04]));
test('trades séparés appliquent le lot complet à chaque TP',()=>{const g=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4010},{price:4020},{price:4030}]});assert.deepEqual(g.children.map(x=>x.lot),[.1,.1,.1]);});
test('position unique crée une seule fiche parent et les enfants partagent le groupe',()=>{const g=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'SELL',lot:.1,entry:4000,stopLoss:4010,takeProfits:[{price:3990},{price:3980}]});assert.equal(new Set(g.children.map(x=>x.groupId)).size,1);assert.equal(g.children.reduce((s,x)=>s+x.lot,0),.1);});
test('calcule le PnL BUY/SELL à partir du volume réellement clôturé',()=>{assert.deepEqual(calculateClosePnl({direction:'BUY',entry:4000,exit:4010,volume:.1,contractSize:100}),{gross:100,fees:0,net:100});assert.deepEqual(calculateClosePnl({direction:'SELL',entry:4000,exit:4010,volume:.1,contractSize:100}),{gross:-100,fees:0,net:-100});});
test('clôture partielle conserve le volume restant et cumule le résultat',()=>{const g=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4020}]});recordPartialClose(g,g.children[0].id,{volume:.04,exit:4010,contractSize:100});assert.equal(g.children[0].remainingLot,.06);assert.equal(g.children[0].realizedPnl,40);assert.equal(groupSummary(g).status,'OPEN');});
test('refuse de clôturer plus que le volume restant',()=>{const g=createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4020}]});assert.throws(()=>recordPartialClose(g,g.children[0].id,{volume:.11,exit:4010,contractSize:100}));});
test('journal lié : une fiche pour position unique, une par trade séparé',()=>{
  const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  const unique=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4010},{price:4020},{price:4030}]});saveTradeGroup(unique);
  const separate=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'SELL',lot:.1,entry:4000,stopLoss:4010,takeProfits:[{price:3990},{price:3980}]});saveTradeGroup(separate);
  const journal=loadLinkedJournal();assert.equal(journal.filter(x=>x.groupId===unique.id).length,1);assert.equal(journal.filter(x=>x.groupId===separate.id).length,2);
  delete globalThis.localStorage;
});
test('les six ordres en attente sont validés avec leurs prix de déclenchement et limite',()=>{for(const orderType of ['BUY LIMIT','BUY STOP','SELL LIMIT','SELL STOP']){const direction=orderType.startsWith('BUY')?'BUY':'SELL';assert.equal(createTradeGroup({instrument:'XAU/USD',direction,lot:.1,entry:4000,stopLoss:direction==='BUY'?3990:4010,takeProfits:[{price:direction==='BUY'?4020:3980}],orderType,triggerPrice:orderType.includes('STOP')?4001:null}).orderType,orderType);}assert.throws(()=>createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4020}],orderType:'BUY STOP LIMIT',triggerPrice:4001}));assert.equal(createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000.5,stopLoss:3990,takeProfits:[{price:4020}],orderType:'BUY STOP LIMIT',triggerPrice:4001,limitPrice:4000.5}).orderType,'BUY STOP LIMIT');assert.equal(createTradeGroup({instrument:'XAU/USD',direction:'SELL',lot:.1,entry:4000.5,stopLoss:4010,takeProfits:[{price:3980}],orderType:'SELL STOP LIMIT',triggerPrice:4000,limitPrice:4000.5}).orderType,'SELL STOP LIMIT');});


test('répartit le reliquat de volume sur les derniers TP (0,10 en trois parts)', () => {
  assert.deepEqual(splitVolume(0.10, 3, 0.01), [0.03, 0.03, 0.04]);
});

test('rejette un mode de gestion inconnu', () => {
  assert.throws(() => createTradeGroup({mode:'other',instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]}), /Mode de gestion invalide/);
});

test('un ordre LIMIT utilise son prix d’entrée sans exiger un déclencheur STOP', () => {
  const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010}],orderType:'BUY LIMIT'});
  assert.equal(group.triggerPrice,null);
  assert.equal(group.limitPrice,2000);
});

test('un ordre STOP exige un prix de déclenchement', () => {
  assert.throws(() => createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}],orderType:'BUY STOP'}), /prix de déclenchement/);
});

test('refuse un lot qui ne respecte pas le pas broker',()=>assert.throws(()=>createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.105,lotStep:.01,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]}),/multiple de 0,01/));
test('refuse une clôture partielle hors pas broker',()=>{const g=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,lotStep:.01,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]});assert.throws(()=>recordPartialClose(g,g.children[0].id,{volume:.015,exit:2005,contractSize:100}),/pas broker/);});

test('les identifiants de position restent au format UUID compatible Supabase',()=>{const g=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]});assert.match(g.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);assert.match(g.children[0].id,/^[0-9a-f-]{36}$/i);});

test('un ordre BUY STOP LIMIT refuse un prix limite au-dessus du déclenchement',()=>assert.throws(()=>createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2010,stopLoss:1990,takeProfits:[{price:2020}],orderType:'BUY STOP LIMIT',triggerPrice:2005,limitPrice:2010}),/prix limite/));

test('une position ouverte sans clôture peut modifier entrée, SL et TP', async()=>{
 const {editOpenTradeGroup}=await import('../trade-management.js');
 const group=createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 editOpenTradeGroup(group,{entry:2002,stopLoss:1992,takeProfits:[2012,2022,2032]});
 assert.equal(group.children[0].entry,2002);assert.equal(group.children[2].takeProfit,2032);
 assert.throws(()=>editOpenTradeGroup({...group,status:'CLOSED'},{entry:2002,stopLoss:1992,takeProfits:[2012,2022,2032]}),/groupe ouvert/);
});

test('conserve une expiration future pour un ordre en attente et refuse une date passée',()=>{
 const future=new Date(Date.now()+3600000).toISOString();
 const group=createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}],orderType:'BUY LIMIT',expiresAt:future});
 assert.equal(group.expiresAt,future);
 assert.throws(()=>createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}],orderType:'BUY LIMIT',expiresAt:'2000-01-01T00:00:00.000Z'}),/expiration.*futur/);
 assert.throws(()=>createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}],orderType:'MARKET',expiresAt:future}),/position au marché/);
});

test('la synchronisation du journal met à jour les prix, volumes restants et clôtures', async()=>{
  const {persistTradeGroup,loadTradeGroups}=await import('../trade-management.js');
  const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}]});
  saveTradeGroup(group);
  group.children[0].entry=2001;group.children[0].stopLoss=1991;group.children[0].takeProfit=2011;
  recordPartialClose(group,group.children[0].id,{volume:group.children[0].lot,exit:2011,contractSize:100});
  persistTradeGroup(group);
  const journal=loadLinkedJournal()[0];
  assert.equal(journal.status,'OPEN');assert.equal(journal.remainingLot,group.children[1].lot);
  assert.equal(journal.takeProfits[0].price,2011);assert.equal(journal.realizedPnl,group.children[0].realizedPnl);
  assert.equal(loadTradeGroups()[0].id,group.id);
  delete globalThis.localStorage;
});

test('si le journal ne peut pas être synchronisé, la position est restaurée', async()=>{
  const {persistTradeGroup}=await import('../trade-management.js');
  const memory=new Map();let failJournal=false;
  globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(failJournal&&k==='aurevia-linked-journal-v2')throw new Error('quota');memory.set(k,v)}};
  const group=createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]});saveTradeGroup(group);
  const before=memory.get('aurevia-position-groups-v2');group.children[0].entry=2001;failJournal=true;
  assert.throws(()=>persistTradeGroup(group),/restaurée à son état précédent/);
  assert.equal(memory.get('aurevia-position-groups-v2'),before);
  delete globalThis.localStorage;
});

test('les ordres en attente démarrent PENDING et les ordres MARKET restent OPEN',()=>{
 const pending=createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}],orderType:'BUY LIMIT'});
 const market=createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}],orderType:'MARKET'});
 assert.equal(pending.children[0].status,'PENDING');
 assert.equal(market.children[0].status,'OPEN');
});

test('snapshot contractuel conservé sur le groupe et utilisé pour les clôtures partielles',()=>{
 const contractSpec={brokerName:'Broker A',accountType:'Raw',accountCurrency:'USD',calculationType:'contract',contractSize:10,quoteToAccount:1,minLot:0.01,lotStep:0.01,maxLot:5,feesPerLot:2};
 const group=createTradeGroup({mode:'unique',instrument:'EUR/USD',direction:'BUY',lot:0.1,entry:1.1,stopLoss:1.09,takeProfits:[{price:1.12}],contractSpec});
 assert.equal(group.contractSpec.contractSize,10);assert.equal(group.brokerSnapshot.brokerName,'Broker A');
 const closed=recordPartialClose(group,group.children[0].id,{volume:0.1,exit:1.11});
 assert.equal(closed.pnl.gross,0.01);assert.equal(closed.pnl.fees,0.2);assert.equal(closed.pnl.net,-0.19);
});

test('statut journal cloud : un ordre en attente reste PENDING sans envoyer PENDING en result SQL',()=>{
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010}],orderType:'BUY LIMIT'});
 const row={result:'OPEN',position_id:group.children[0].id};
 assert.equal(resolveLinkedJournalStatus(row,group),'PENDING');
 group.children[0].status='OPEN';
 assert.equal(resolveLinkedJournalStatus(row,group),'OPEN');
 group.children[0].status='CLOSED';
 assert.equal(resolveLinkedJournalStatus(row,group),'CLOSED');
});
test('statut journal parent suit les enfants en attente et ouverts',()=>{
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010},{price:2020}],orderType:'BUY LIMIT'});
 const row={result:'OPEN',position_id:null};
 assert.equal(resolveLinkedJournalStatus(row,group),'PENDING');
 group.children[0].status='OPEN';
 assert.equal(resolveLinkedJournalStatus(row,group),'OPEN');
});

test('les trades séparés se modifient indépendamment',()=>{
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}]});
 editSeparateTradeChild(group,group.children[0].id,{entry:2001,stopLoss:1991,takeProfit:2011});
 assert.equal(group.children[0].entry,2001);assert.equal(group.children[0].takeProfit,2011);
 assert.equal(group.children[1].entry,2000);assert.equal(group.children[1].takeProfit,2020);
 assert.throws(()=>editSeparateTradeChild(group,group.children[0].id,{entry:2001,stopLoss:2011,takeProfit:2010}),/BUY/);
});
test('un trade séparé ouvert ne peut pas être retiré du suivi',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}]});
 saveTradeGroup(group);assert.throws(()=>deleteSeparateTradeChild(group.id,group.children[0].id),/entièrement clôturé/);
 assert.equal(loadTradeGroups()[0].children.length,2);delete globalThis.localStorage;
});

test('un trade séparé clôturé peut être retiré du suivi sans supprimer son journal',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}]});
 saveTradeGroup(group);const journalBefore=loadLinkedJournal().length;
 recordPartialClose(group,group.children[0].id,{volume:group.children[0].remainingLot,exit:2010,contractSize:100});persistTradeGroup(group);
 deleteSeparateTradeChild(group.id,group.children[0].id);
 assert.equal(loadTradeGroups().length,1);assert.equal(loadTradeGroups()[0].children.length,1);
 assert.equal(loadLinkedJournal().length,journalBefore);delete globalThis.localStorage;
});
test('suppression du suivi d’une position clôturée conserve son journal',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010}]});
 saveTradeGroup(group);recordPartialClose(group,group.children[0].id,{volume:.1,exit:2010,contractSize:100});persistTradeGroup(group);
 const journalBefore=loadLinkedJournal().length;deleteClosedTradeGroup(group.id);
 assert.equal(loadTradeGroups().length,0);assert.equal(loadLinkedJournal().length,journalBefore);
 delete globalThis.localStorage;
});
test('suppression d’une fiche journal liée conserve le groupe de positions',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]});
 saveTradeGroup(group);const entry=loadLinkedJournal()[0];deleteLinkedJournalEntry(entry.id);
 assert.equal(loadLinkedJournal().length,0);assert.equal(loadTradeGroups().length,1);
 delete globalThis.localStorage;
});


test('position unique : modification groupée de l’entrée, du SL et de tous les TP',async()=>{
 const {editOpenTradeGroup}=await import('../trade-management.js');
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 const ids=group.children.map(child=>child.id);
 editOpenTradeGroup(group,{entry:2002,stopLoss:1992,takeProfits:[2012,2022,2032]});
 assert.deepEqual(group.children.map(child=>child.id),ids);
 assert.deepEqual(group.children.map(child=>child.entry),[2002,2002,2002]);
 assert.deepEqual(group.children.map(child=>child.stopLoss),[1992,1992,1992]);
 assert.deepEqual(group.children.map(child=>child.takeProfit),[2012,2022,2032]);
 assert.deepEqual(group.children.map(child=>child.initialLot),[0.01,0.01,0.01]);
});

test('position unique en attente : modification autorisée ; après une clôture : modification bloquée',async()=>{
 const {editOpenTradeGroup}=await import('../trade-management.js');
 const pending=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'SELL',lot:0.02,entry:2000,stopLoss:2010,takeProfits:[{label:'TP1',price:1990},{label:'TP2',price:1980}],orderType:'SELL LIMIT'});
 assert.ok(pending.children.every(child=>child.status==='PENDING'));
 editOpenTradeGroup(pending,{entry:2001,stopLoss:2011,takeProfits:[1991,1981]});
 assert.equal(pending.children[0].entry,2001);
 const active=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.02,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}]});
 recordPartialClose(active,active.children[0].id,{volume:0.01,exit:2010,contractSize:100});
 assert.throws(()=>editOpenTradeGroup(active,{entry:2001,stopLoss:1991,takeProfits:[2011,2021]}),/sans clôture enregistrée/);
});

test('la modification d’une position unique met à jour son unique fiche journal',async()=>{
 const {editOpenTradeGroup}=await import('../trade-management.js');
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 saveTradeGroup(group);
 editOpenTradeGroup(group,{entry:2003,stopLoss:1993,takeProfits:[2013,2023,2033]});
 persistTradeGroup(group);
 const rows=loadLinkedJournal().filter(row=>row.groupId===group.id);
 assert.equal(rows.length,1);
 assert.equal(rows[0].entry,2003);
 assert.equal(rows[0].stopLoss,1993);
 assert.deepEqual(rows[0].takeProfits.map(tp=>tp.price),[2013,2023,2033]);
 assert.equal(rows[0].remainingLot,group.requestedLot);
 delete globalThis.localStorage;
});

test('la modification groupée refuse le mode Trades séparés',async()=>{
 const {editOpenTradeGroup}=await import('../trade-management.js');
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]});
 assert.throws(()=>editOpenTradeGroup(group,{entry:2001,stopLoss:1991,takeProfits:[2011]}),/Position unique/);
});


test('une position unique ouverte ne peut pas être retirée du suivi',async()=>{
 const {deleteOpenTradeGroup}=await import('../trade-management.js');
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 saveTradeGroup(group);assert.throws(()=>deleteOpenTradeGroup(group.id),/entièrement clôturée/);
 assert.equal(loadTradeGroups().some(row=>row.id===group.id),true);delete globalThis.localStorage;
});

test('position unique partiellement clôturée : retrait du suivi refusé',async()=>{
 const {deleteClosedTradeGroup}=await import('../trade-management.js');
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 saveTradeGroup(group);recordPartialClose(group,group.children[0].id,{volume:0.01,exit:2010,contractSize:100});persistTradeGroup(group);
 assert.throws(()=>deleteClosedTradeGroup(group.id),/entièrement clôturé/);
 assert.equal(loadTradeGroups().some(row=>row.id===group.id),true);delete globalThis.localStorage;
});


test('position unique : suppression de la fiche journal seule conserve tous les trades',async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 saveTradeGroup(group);const entry=loadLinkedJournal().find(row=>row.groupId===group.id);
 deleteLinkedJournalEntry(entry.id);
 assert.equal(loadLinkedJournal().some(row=>row.groupId===group.id),false);
 assert.equal(loadTradeGroups().find(row=>row.id===group.id).children.length,3);
 delete globalThis.localStorage;
});

test('clôtures partielles en position unique conservent le lot initial et recalculent le restant',()=>{
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 const initial=group.requestedLot;
 recordPartialClose(group,group.children[0].id,{volume:0.01,exit:2010,contractSize:100});
 assert.equal(group.requestedLot,initial);
 assert.equal(groupSummary(group).remaining,0.02);
 assert.equal(group.children.reduce((sum,child)=>sum+child.initialLot,0),initial);
});


test('une position unique entièrement clôturée peut être retirée du suivi en conservant son journal',async()=>{
 const {deleteClosedTradeGroup}=await import('../trade-management.js');
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.01,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010}]});
 saveTradeGroup(group);const journalBefore=loadLinkedJournal().filter(row=>row.groupId===group.id);
 recordPartialClose(group,group.children[0].id,{volume:0.01,exit:2010,contractSize:100});persistTradeGroup(group);
 assert.equal(deleteClosedTradeGroup(group.id),true);
 assert.equal(loadTradeGroups().some(row=>row.id===group.id),false);
 assert.equal(loadLinkedJournal().filter(row=>row.groupId===group.id).length,journalBefore.length);delete globalThis.localStorage;
});


test('payload cloud canonique : position unique garde PENDING et journal reçoit OPEN',()=>{
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}],orderType:'BUY LIMIT'});
 const payload=buildTradeGroupCloudRows(group,'user-1');
 assert.equal(payload.groupRow.auto_journal,true);
 assert.equal(payload.positions.length,3);
 assert.ok(payload.positions.every(row=>row.status==='PENDING'));
 assert.equal(payload.journalRows.length,1);
 assert.equal(payload.journalRows[0].result,'OPEN');
 assert.equal(payload.journalRows[0].mode,'unique');
 assert.equal(payload.journalRows[0].volume_initial,0.03);
 assert.equal(payload.journalRows[0].volume_remaining,0.03);
});

test('payload cloud canonique : trades séparés créent une fiche OPEN par enfant',()=>{
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'SELL',lot:0.1,entry:2000,stopLoss:2010,takeProfits:[{label:'TP1',price:1990},{label:'TP2',price:1980}],orderType:'SELL LIMIT'});
 const payload=buildTradeGroupCloudRows(group,'user-1');
 assert.equal(payload.positions.length,2);
 assert.ok(payload.positions.every(row=>row.status==='PENDING'));
 assert.equal(payload.journalRows.length,2);
 assert.ok(payload.journalRows.every(row=>row.result==='OPEN'&&row.mode==='separate'));
 assert.deepEqual(payload.journalRows.map(row=>row.position_id),group.children.map(child=>child.id));
 assert.deepEqual(payload.journalRows.map(row=>row.volume_initial),[0.1,0.1]);
});

test('payload cloud : journal désactivé pour tous les modes ne crée aucune fiche',()=>{
 for(const mode of ['unique','separate']){
  const group=createTradeGroup({mode,instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010},{price:2020}],autoJournal:false,orderType:'BUY LIMIT'});
  const payload=buildTradeGroupCloudRows(group,'user-1');
  assert.equal(payload.groupRow.auto_journal,false);
  assert.equal(payload.journalRows.length,0);
 }
});

test('payload cloud : un ordre MARKET transmet OPEN au suivi et au journal',()=>{
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]});
 const payload=buildTradeGroupCloudRows(group,'user-1');
 assert.equal(payload.positions[0].status,'OPEN');
 assert.equal(payload.journalRows[0].result,'OPEN');
});


test('un trade en attente ne peut jamais être clôturé avant son activation',()=>{
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010}],orderType:'BUY LIMIT'});
 const child=group.children[0];
 assert.equal(child.status,'PENDING');
 const before={remainingLot:child.remainingLot,closes:child.closes.length,realizedPnl:child.realizedPnl,status:child.status};
 assert.throws(()=>recordPartialClose(group,child.id,{volume:child.remainingLot,exit:2005,contractSize:100}),/encore en attente/);
 assert.deepEqual({remainingLot:child.remainingLot,closes:child.closes.length,realizedPnl:child.realizedPnl,status:child.status},before);
});

test('une position unique en attente ne propose aucune clôture et ses enfants restent en attente',()=>{
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}],orderType:'BUY LIMIT'});
 assert.equal(group.children.every(child=>child.status==='PENDING'),true);
 for(const child of group.children)assert.throws(()=>recordPartialClose(group,child.id,{volume:child.remainingLot,exit:2005,contractSize:100}),/encore en attente/);
 assert.equal(group.children.every(child=>child.status==='PENDING'&&child.closes.length===0),true);
});


test('un trade déjà clôturé automatiquement au TP/SL ne peut pas être clôturé une seconde fois manuellement',()=>{
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:0.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010}]});
 const child=group.children[0];
 recordPartialClose(group,child.id,{volume:child.remainingLot,exit:2010,contractSize:100});
 assert.equal(child.status,'CLOSED');
 assert.equal(child.remainingLot,0);
 assert.equal(child.closes.length,1);
 const before={remainingLot:child.remainingLot,closes:child.closes.length,realizedPnl:child.realizedPnl,status:child.status};
 assert.throws(()=>recordPartialClose(group,child.id,{volume:0.1,exit:2011,contractSize:100}),/déjà clôturée/);
 assert.deepEqual({remainingLot:child.remainingLot,closes:child.closes.length,realizedPnl:child.realizedPnl,status:child.status},before);
});


test('supprimer un trade séparé en attente supprime aussi sa fiche journal et conserve les autres trades',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}],orderType:'BUY LIMIT'});
 saveTradeGroup(group);const child=group.children[0],other=group.children[1];const before=loadLinkedJournal().length;
 deletePendingSeparateTradeChild(group.id,child.id);
 assert.equal(loadTradeGroups()[0].children.length,1);assert.equal(loadTradeGroups()[0].children[0].id,other.id);
 assert.equal(loadLinkedJournal().length,before-1);assert.equal(loadLinkedJournal().some(row=>row.childId===child.id),false);
 delete globalThis.localStorage;
});
test('supprimer une position unique en attente supprime son groupe et son unique fiche journal',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010},{price:2020}],orderType:'BUY LIMIT'});
 saveTradeGroup(group);assert.equal(loadLinkedJournal().filter(row=>row.groupId===group.id).length,1);deletePendingTradeGroup(group.id);
 assert.equal(loadTradeGroups().some(row=>row.id===group.id),false);assert.equal(loadLinkedJournal().some(row=>row.groupId===group.id),false);
 delete globalThis.localStorage;
});
test('la suppression en attente refuse un trade déjà ouvert ou clôturé',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{price:2010}],orderType:'BUY LIMIT'});saveTradeGroup(group);
 const stored=loadTradeGroups()[0];stored.children[0].status='OPEN';persistTradeGroup(stored);assert.throws(()=>deletePendingSeparateTradeChild(group.id,group.children[0].id),/encore en attente/);
 delete globalThis.localStorage;
});

test('rejette un BUY LIMIT si le cours est déjà sous ou au niveau de l’entrée',()=>{
 const result=validatePendingOrderAgainstQuote({orderType:'BUY LIMIT',direction:'BUY',entry:4000,marketPrice:3990});
 assert.equal(result.ok,false);assert.match(result.error,/BUY LIMIT invalide/);
 assert.equal(validatePendingOrderAgainstQuote({orderType:'BUY LIMIT',direction:'BUY',entry:4000,marketPrice:4010}).ok,true);
});
test('valide les côtés de marché des six types d’ordres en attente',()=>{
 const cases=[
  ['BUY LIMIT','BUY',4000,null,4010,true],['BUY LIMIT','BUY',4000,null,3990,false],
  ['SELL LIMIT','SELL',4000,null,3990,true],['SELL LIMIT','SELL',4000,null,4010,false],
  ['BUY STOP','BUY',4000,4000,3990,true],['BUY STOP','BUY',4000,4000,4010,false],
  ['SELL STOP','SELL',4000,4000,4010,true],['SELL STOP','SELL',4000,4000,3990,false],
  ['BUY STOP LIMIT','BUY',3990,4000,3995,true],['BUY STOP LIMIT','BUY',3990,4000,4005,false],
  ['SELL STOP LIMIT','SELL',4010,4000,4005,true],['SELL STOP LIMIT','SELL',4010,4000,3995,false]
 ];
 for(const [orderType,direction,entry,triggerPrice,marketPrice,ok] of cases){
  assert.equal(validatePendingOrderAgainstQuote({orderType,direction,entry,triggerPrice,marketPrice}).ok,ok,orderType+' at '+marketPrice);
 }
});
test('refuse de créer un ordre en attente sans cours de marché vérifiable',()=>{
 assert.equal(validatePendingOrderAgainstQuote({orderType:'BUY LIMIT',direction:'BUY',entry:4000,marketPrice:null}).ok,false);
});


test('un horodatage unique est partagé par le groupe, tous les TP, le journal local et le cloud',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}]});
 assert.ok(group.createdAt);assert.ok(group.children.every(child=>child.createdAt===group.createdAt));
 saveTradeGroup(group);assert.ok(loadLinkedJournal().every(row=>row.createdAt===group.createdAt));
 const cloud=buildTradeGroupCloudRows(group,'00000000-0000-4000-8000-000000000001');
 assert.equal(cloud.groupRow.created_at,group.createdAt);assert.ok(cloud.positions.every(row=>row.opened_at===group.createdAt));assert.ok(cloud.journalRows.every(row=>row.created_at===group.createdAt));
 delete globalThis.localStorage;
});


test('lot minimum technique de 0,01 accepté et volume inférieur refusé',()=>{
 const base={mode:'unique',instrument:'XAU/USD',direction:'BUY',entry:2000,stopLoss:1990,takeProfits:[{price:2010}]};
 const group=createTradeGroup({...base,lot:0.01,lotStep:0.01,contractSpec:{brokerName:'Exness',accountCurrency:'USD',calculationType:'contract',contractSize:100,quoteToAccount:1,minLot:0.01,lotStep:0.01,maxLot:null,feesPerLot:0}});
 assert.equal(group.children[0].lot,0.01);
 assert.throws(()=>createTradeGroup({...base,lot:0.009,lotStep:0.01}),/lot minimum autorisé/);
});

test('position unique exige au moins 0,01 par TP',()=>{
 const base={mode:'unique',instrument:'XAU/USD',direction:'BUY',entry:2000,stopLoss:1990,takeProfits:[{price:2010},{price:2020},{price:2030}],lot:0.02,lotStep:0.01,contractSpec:{brokerName:'Exness',accountCurrency:'USD',calculationType:'contract',contractSize:100,quoteToAccount:1,minLot:0.01,lotStep:0.01,maxLot:null,feesPerLot:0}};
 assert.throws(()=>createTradeGroup(base),/volume est insuffisant|Volume insuffisant|minimum et maximum/);
});

test('BUY STOP et SELL STOP valident le cours contre le déclenchement, pas le prix indicatif',()=>{
 assert.equal(validatePendingOrderAgainstQuote({orderType:'BUY STOP',direction:'BUY',entry:4050,triggerPrice:4000,marketPrice:3990}).ok,true);
 assert.equal(validatePendingOrderAgainstQuote({orderType:'BUY STOP',direction:'BUY',entry:4050,triggerPrice:4000,marketPrice:4010}).ok,false);
 assert.equal(validatePendingOrderAgainstQuote({orderType:'SELL STOP',direction:'SELL',entry:3950,triggerPrice:4000,marketPrice:4010}).ok,true);
 assert.equal(validatePendingOrderAgainstQuote({orderType:'SELL STOP',direction:'SELL',entry:3950,triggerPrice:4000,marketPrice:3990}).ok,false);
 assert.equal(validatePendingOrderAgainstQuote({orderType:'BUY STOP',direction:'BUY',entry:4050,triggerPrice:null,marketPrice:3990}).ok,false);
});
