import test from 'node:test';
import assert from 'node:assert/strict';
import {splitVolume,createTradeGroup,calculateClosePnl,recordPartialClose,groupSummary} from '../trade-management.js';

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
