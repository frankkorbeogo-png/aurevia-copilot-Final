import test from 'node:test';
import assert from 'node:assert/strict';
import {addJournalTrade,deleteJournalTrade,loadJournalTrades,renderJournal} from '../journal.js';
const store=new Map();
globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
function reset(){store.clear();}
test('le journal local ajoute puis supprime une fiche par identifiant',()=>{reset();const added=addJournalTrade({instrument:'XAU/USD',direction:'BUY',result:25,date:'2026-11-11',note:'test'});assert.equal(added.ok,true);const row=loadJournalTrades()[0];assert.ok(row.id);assert.equal(deleteJournalTrade(row.id).ok,true);assert.equal(loadJournalTrades().length,0);assert.equal(deleteJournalTrade(row.id).ok,false);});
test('le journal calcule séparément gagnants, perdants et taux sur les trades clôturés',()=>{reset();addJournalTrade({instrument:'XAU/USD',direction:'BUY',result:25,date:'2026-11-11'});addJournalTrade({instrument:'XAU/USD',direction:'SELL',result:-10,date:'2026-11-11'});addJournalTrade({instrument:'XAU/USD',direction:'BUY',result:0,date:'2026-11-11'});const nodes={journalCount:{},journalWins:{},journalLosses:{},journalWinRate:{},journalNet:{},journalRows:{}};globalThis.document={getElementById:id=>nodes[id]||null};renderJournal();assert.equal(nodes.journalCount.textContent,3);assert.equal(nodes.journalWins.textContent,1);assert.equal(nodes.journalLosses.textContent,1);assert.equal(nodes.journalWinRate.textContent,'50.0 %');assert.equal(nodes.journalNet.textContent,'15.00');});
