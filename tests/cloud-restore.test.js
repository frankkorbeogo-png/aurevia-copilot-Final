import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTradeGroup, loadTradeGroups, loadLinkedJournal, mergeRestoredTradeGroups, deleteClosedTradeGroup, persistTradeGroup } from '../trade-management.js';

function withStorage(fn){
  const previous=globalThis.localStorage;
  const data=new Map();
  globalThis.localStorage={getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value))};
  try{return fn();}finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
}
function fixture(status='OPEN'){
  const child={id:'child-1',groupId:'group-1',instrument:'XAU/USD',direction:'BUY',tpLabel:'TP1',entry:2000,stopLoss:1990,takeProfit:2020,initialLot:0.1,lot:0.1,remainingLot:status==='CLOSED'?0:0.1,status,realizedPnl:status==='CLOSED'?20:0,closes:[],createdAt:'2026-11-12T00:00:00.000Z'};
  return {id:'group-1',instrument:'XAU/USD',direction:'BUY',mode:'unique',requestedLot:0.1,autoJournal:true,status,createdAt:'2026-11-12T00:00:00.000Z',children:[child]};
}

test('la restauration cloud remplace la fiche liée locale sans créer de doublon',()=>withStorage(()=>{
  saveTradeGroup(fixture());
  mergeRestoredTradeGroups([fixture('CLOSED')],[{id:'cloud-journal-1',cloudId:'cloud-journal-1',groupId:'group-1',childId:null,mode:'unique',instrument:'XAU/USD',direction:'BUY',realizedPnl:20,status:'CLOSED'}]);
  assert.equal(loadTradeGroups().length,1);
  assert.equal(loadTradeGroups()[0].status,'CLOSED');
  assert.equal(loadLinkedJournal().length,1);
  assert.equal(loadLinkedJournal()[0].id,'cloud-journal-1');
}));

test('la suppression locale refuse un groupe ouvert et supprime le journal d’un groupe clôturé',()=>withStorage(()=>{
  saveTradeGroup(fixture());
  assert.throws(()=>deleteClosedTradeGroup('group-1'),/entièrement clôturé/);
  const closed=fixture('CLOSED');
  persistTradeGroup(closed);
  assert.equal(deleteClosedTradeGroup('group-1'),true);
  assert.equal(loadTradeGroups().length,0);
  assert.equal(loadLinkedJournal().length,0);
}));
