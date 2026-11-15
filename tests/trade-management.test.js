import test from 'node:test';
import assert from 'node:assert/strict';
import {splitVolume,createTradeGroup,calculateClosePnl,recordPartialClose,groupSummary,resolveLinkedJournalStatus,editSeparateTradeChild,deleteSeparateTradeChild,deleteClosedTradeGroup,deleteLinkedJournalEntry,persistTradeGroup,loadTradeGroups,saveTradeGroup} from '../trade-management.js';

test('position unique répartit le volume total en respectant le pas',()=>assert.deepEqual(splitVolume(.10,3,.01),[.03,.03,.04]));
test('trades séparés appliquent le lot complet à chaque TP',()=>{const g=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4010},{price:4020},{price:4030}]});assert.deepEqual(g.children.map(x=>x.lot),[.1,.1,.1]);});
test('position unique crée une seule fiche parent et les enfants partagent le groupe',()=>{const g=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'SELL',lot:.1,entry:4000,stopLoss:4010,takeProfits:[{price:3990},{price:3980}]});assert.equal(new Set(g.children.map(x=>x.groupId)).size,1);assert.equal(g.children.reduce((s,x)=>s+x.lot,0),.1);});
test('calcule le PnL BUY/SELL à partir du volume réellement clôturé',()=>{assert.deepEqual(calculateClosePnl({direction:'BUY',entry:4000,exit:4010,volume:.1,contractSize:100}),{gross:100,fees:0,net:100});assert.deepEqual(calculateClosePnl({direction:'SELL',entry:4000,exit:4010,volume:.1,contractSize:100}),{gross:-100,fees:0,net:-100});});
test('clôture partielle conserve le volume restant et cumule le résultat',()=>{const g=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4020}]});recordPartialClose(g,g.children[0].id,{volume:.04,exit:4010,contractSize:100});assert.equal(g.children[0].remainingLot,.06);assert.equal(g.children[0].realizedPnl,40);assert.equal(groupSummary(g).status,'OPEN');});
test('refuse de clôturer plus que le volume restant',()=>{const g=createTradeGroup({instrument:'XAU/USD',direction:'BUY',lot:.1,entry:4000,stopLoss:3990,takeProfits:[{price:4020}]});assert.throws(()=>recordPartialClose(g,g.children[0].id,{volume:.11,exit:4010,contractSize:100}));});
import {saveTradeGroup,loadLinkedJournal} from '../trade-management.js';
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

test('refuse un lot qui ne respecte pas le pas broker',()=>assert.throws(()=>createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:.105,lotStep:.01,entry:2000,stopLoss:1990,takeProfits:[{price:2010}]}),/pas de volume/));
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
test('suppression d’un trade séparé ne supprime pas la fiche journal associée',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'separate',instrument:'XAU/USD',direction:'BUY',lot:.1,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020}]});
 saveTradeGroup(group);const journalBefore=loadLinkedJournal().length;
 deleteSeparateTradeChild(group.id,group.children[0].id);
 assert.equal(loadTradeGroups().length,1);assert.equal(loadTradeGroups()[0].children.length,1);
 assert.equal(loadLinkedJournal().length,journalBefore);
 delete globalThis.localStorage;
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


test('position unique sans clôture : suppression du suivi conserve la fiche journal',async()=>{
 const {deleteOpenTradeGroup}=await import('../trade-management.js');
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 saveTradeGroup(group);const journalBefore=loadLinkedJournal().filter(row=>row.groupId===group.id);
 assert.equal(journalBefore.length,1);
 assert.equal(deleteOpenTradeGroup(group.id),true);
 assert.equal(loadTradeGroups().some(row=>row.id===group.id),false);
 assert.equal(loadLinkedJournal().filter(row=>row.groupId===group.id).length,1);
 delete globalThis.localStorage;
});

test('position unique avec clôture partielle : suppression du suivi refusée',async()=>{
 const {deleteOpenTradeGroup}=await import('../trade-management.js');
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.03,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010},{label:'TP2',price:2020},{label:'TP3',price:2030}]});
 saveTradeGroup(group);recordPartialClose(group,group.children[0].id,{volume:0.01,exit:2010,contractSize:100});persistTradeGroup(group);
 assert.throws(()=>deleteOpenTradeGroup(group.id),/avant toute clôture/);
 assert.equal(loadTradeGroups().some(row=>row.id===group.id),true);
 delete globalThis.localStorage;
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


test('une position unique avec clôture complète ne peut plus être supprimée du suivi',async()=>{
 const {deleteClosedTradeGroup}=await import('../trade-management.js');
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const group=createTradeGroup({mode:'unique',instrument:'XAU/USD',direction:'BUY',lot:0.01,entry:2000,stopLoss:1990,takeProfits:[{label:'TP1',price:2010}]});
 saveTradeGroup(group);recordPartialClose(group,group.children[0].id,{volume:0.01,exit:2010,contractSize:100});persistTradeGroup(group);
 assert.throws(()=>deleteClosedTradeGroup(group.id),/position unique ayant atteint une clôture/);
 assert.equal(loadTradeGroups().some(row=>row.id===group.id),true);
 delete globalThis.localStorage;
});
