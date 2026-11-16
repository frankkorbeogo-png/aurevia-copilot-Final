import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const management=await readFile(new URL('../trade-management.js',import.meta.url),'utf8');

test('les trades non synchronisés restent en file locale et sont retentés automatiquement',()=>{
  assert.match(app,/TRADE_SYNC_QUEUE_KEY/);
  assert.match(app,/async function flushTradeSyncQueue\(\)/);
  assert.match(app,/setInterval\(\(\)=>\{if\(window\.__aureviaAuthenticated\)flushTradeSyncQueue\(\);\},30000\)/);
  assert.match(app,/queueTradeGroupSync\(group\.id,tradeLines\.join/);
  assert.match(app,/queueTradeCloseSync\(latestGroup\.id,closedChild\.id,closeEvent\.id/);
});

test('Telegram ne confirme une ouverture qu’après la synchronisation cloud',()=>{
  const start=app.indexOf('async function flushTradeSyncQueue');
  const end=app.indexOf('\nfunction refreshSelectedQuote',start);
  const worker=app.slice(start,end);
  const cloud=worker.indexOf('await syncTradeGroupToSupabase(group,ownerId)');
  const telegram=worker.indexOf("sendTelegramNotification({type:'trade_open'");
  assert.ok(cloud>=0&&telegram>cloud);
  assert.match(app,/Aucune notification Telegram ne partira avant confirmation cloud/);
});

test('Telegram ne confirme une clôture qu’après la RPC cloud de clôture',()=>{
  const start=app.indexOf('async function flushTradeSyncQueue');
  const end=app.indexOf('\nfunction refreshSelectedQuote',start);
  const worker=app.slice(start,end);
  const cloud=worker.indexOf('await syncTradeCloseToSupabase(group,child,closeEvent,ownerId)');
  const telegram=worker.indexOf("sendTelegramNotification({type:'trade_close'");
  assert.ok(cloud>=0&&telegram>cloud);
});

test('la restauration cloud ne remplace pas les données locales encore en attente',()=>{
  assert.match(management,/markTradeGroupCloudSyncPending/);
  assert.match(management,/markTradeCloseCloudSyncPending/);
  assert.match(management,/pendingGroupIds/);
  assert.match(management,/if\(!pendingGroupIds\.has\(group\.id\)\)byId\.set\(group\.id,group\)/);
});
