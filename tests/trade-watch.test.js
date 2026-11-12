import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePositionThreshold,evaluateEntryTrigger} from '../netlify/functions/trade-watch.mjs';
test('surveillance interne détecte TP et SL BUY avec priorité SL si les deux niveaux sont franchis',()=>{
 const p={direction:'BUY',stop_loss:1980,take_profit:2020};
 assert.equal(evaluatePositionThreshold(p,2021),'TP');
 assert.equal(evaluatePositionThreshold(p,1979),'SL');
 assert.equal(evaluatePositionThreshold(p,2000),null);
 assert.equal(evaluatePositionThreshold(p,1970),'SL');
});
test('surveillance interne détecte TP et SL SELL',()=>{
 const p={direction:'SELL',stop_loss:2020,take_profit:1980};
 assert.equal(evaluatePositionThreshold(p,1979),'TP');
 assert.equal(evaluatePositionThreshold(p,2021),'SL');
 assert.equal(evaluatePositionThreshold(p,2000),null);
});

test('alerte Telegram affiche le volume réellement clôturé et non le volume initial',async()=>{
 const {formatTradeAlertMessage}=await import('../netlify/functions/trade-watch.mjs');
 const message=formatTradeAlertMessage({event_type:'TP',observed_price:2030,closed_volume:0.04},{tp_label:'TP2',volume_initial:0.10},{instrument:'XAU/USD',direction:'BUY'});
 assert.match(message,/Volume interne clôturé : 0.04/);
 assert.doesNotMatch(message,/0.10/);
});

test('surveillance ne supprime pas une alerte partagée lorsqu’une autre exécution gagne la clôture conditionnelle',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/rpc\/aurevia_record_position_close_worker/);
 assert.doesNotMatch(source,/trading_positions\?id=eq\.\$\{p\.id\}[^\n]*PATCH[^\n]*body:\{status:'CLOSED'/s);
 assert.match(source,/status:'cancelled'/);
});
test('identifiant d’alerte réutilisé comme identifiant de clôture pour rendre l’écriture idempotente',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/p_close_id:alert\.id,p_position_id:p\.id/);
});
test('les alertes Telegram sont réservées atomiquement avec SKIP LOCKED et bail expirant',async()=>{
 const {readFile}=await import('node:fs/promises');
 const sql=await readFile(new URL('../supabase/migrations/20261112110000_atomic_telegram_claims_v233.sql',import.meta.url),'utf8');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 assert.match(sql,/for update skip locked/i);
 assert.match(sql,/interval '5 minutes'/i);
 assert.match(sql,/auth\.role\(\).*service_role/s);
 assert.match(source,/rpc\/aurevia_claim_trade_alert_events/);
 assert.match(source,/rpc\/aurevia_finish_trade_alert_event/);
 assert.doesNotMatch(source,/status=eq\.pending&order=created_at/);
});

test('la clôture TP/SL planifiée utilise une transaction SQL service_role pour position, journal et groupe',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 const sql=await readFile(new URL('../supabase/migrations/20261112120000_atomic_worker_position_close_v234.sql',import.meta.url),'utf8');
 assert.match(source,/rpc\/aurevia_record_position_close_worker/);
 assert.doesNotMatch(source,/trading_positions\?id=eq\.\$\{p\.id\}[^\n]*PATCH[^\n]*body:\{status:'CLOSED'/s);
 assert.match(sql,/auth\.role\(\).*service_role/s);
 assert.match(sql,/for update/i);
 assert.match(sql,/trading_position_closes/);
 assert.match(sql,/trading_journal/);
 assert.match(sql,/trading_position_groups/);
 assert.match(sql,/grant execute .* to service_role/i);
 assert.match(sql,/revoke all .*authenticated/i);
});

test('surveillance refuse de clôturer si les métadonnées de calcul P/L sont absentes',async()=>{
 const {calculateInternalClosePnl}=await import('../netlify/functions/trade-watch.mjs');
 assert.throws(()=>calculateInternalClosePnl({volume_remaining:0.1,entry_price:2000,contract_size:null,quote_to_account:1},'BUY',2010),/P\/L incomplètes/);
});
test('surveillance calcule le P/L BUY et SELL avec volume, contrat, conversion et frais',async()=>{
 const {calculateInternalClosePnl}=await import('../netlify/functions/trade-watch.mjs');
 const p={volume_remaining:0.1,entry_price:2000,contract_size:100,quote_to_account:1,fees_per_lot:2};
 assert.deepEqual(calculateInternalClosePnl(p,'BUY',2010),{gross:100,fees:0.2,net:99.8,volume:0.1});
 assert.deepEqual(calculateInternalClosePnl(p,'SELL',1990),{gross:100,fees:0.2,net:99.8,volume:0.1});
});

test('une alerte de clôture est annulée si le calcul P/L échoue avant la transaction',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/calculationError/);
 assert.match(source,/aurevia_trade_alert_events\?id=eq\.\$\{alert\.id\}&status=eq\.pending/);
 assert.match(source,/body:\{status:'cancelled'\}/);
});

test('une alerte est annulée si Telegram est volontairement désactivé ou non connecté',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/suppressed:true/);
 assert.match(source,/status:'cancelled',locked_at:null/);
 assert.match(source,/if\(suppressed\)/);
});


test('une alerte annulée pour métadonnées manquantes peut être réactivée après correction',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/alert\.status==='cancelled'/);
 assert.match(source,/status=eq\.cancelled/);
 assert.match(source,/body:\{status:'pending',locked_at:null\}/);
 assert.match(source,/if\(!reactivated\?\.length\)continue/);
});


test('Telegram ne notifie jamais une clôture TP/SL sans ligne de clôture persistée',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../netlify/functions/trade-watch.mjs',import.meta.url),'utf8');
 assert.match(source,/trading_position_closes\?select=id,position_id,user_id,volume,exit_price,net_pnl/);
 assert.match(source,/Clôture interne non confirmée/);
 assert.match(source,/closed_volume:closes\[0\]\.volume,observed_price:closes\[0\]\.exit_price/);
});

test('surveillance ignore les cotations, niveaux ou directions invalides au lieu de déclencher une clôture',()=>{
 assert.equal(evaluatePositionThreshold({direction:'BUY',stop_loss:null,take_profit:2020},2010),null);
 assert.equal(evaluatePositionThreshold({direction:'BUY',stop_loss:1980,take_profit:NaN},2021),null);
 assert.equal(evaluatePositionThreshold({direction:'HOLD',stop_loss:1980,take_profit:2020},2021),null);
 assert.equal(evaluatePositionThreshold({direction:'BUY',stop_loss:1980,take_profit:2020},NaN),null);
 assert.equal(evaluatePositionThreshold({direction:'BUY',stop_loss:1980,take_profit:2020},0),null);
});


test('BUY LIMIT et BUY STOP utilisent le prix simple du marché',()=>{
 const q={price:2000};
 assert.equal(evaluateEntryTrigger({entry_price:2000},{direction:'BUY',order_type:'BUY LIMIT'},q),'ACTIVATE');
 assert.equal(evaluateEntryTrigger({entry_price:1999},{direction:'BUY',order_type:'BUY STOP'},q),'ACTIVATE');
 assert.equal(evaluateEntryTrigger({entry_price:1999},{direction:'BUY',order_type:'BUY LIMIT'},q),null);
});
test('SELL LIMIT et SELL STOP utilisent le même prix simple du marché',()=>{
 const q={price:2000};
 assert.equal(evaluateEntryTrigger({entry_price:2000},{direction:'SELL',order_type:'SELL LIMIT'},q),'ACTIVATE');
 assert.equal(evaluateEntryTrigger({entry_price:2001},{direction:'SELL',order_type:'SELL STOP'},q),'ACTIVATE');
 assert.equal(evaluateEntryTrigger({entry_price:2001},{direction:'SELL',order_type:'SELL LIMIT'},q),null);
});
test('STOP LIMIT utilise le prix simple pour le déclenchement puis le retour',()=>{
 const group={direction:'BUY',order_type:'BUY STOP LIMIT'};
 assert.equal(evaluateEntryTrigger({entry_price:1999,trigger_price:2001,trigger_seen:false},group,{price:2001}),'TRIGGER_SEEN');
 assert.equal(evaluateEntryTrigger({entry_price:1999,trigger_price:2001,trigger_seen:true},group,{price:1999}),'ACTIVATE');
 assert.equal(evaluateEntryTrigger({entry_price:1999,trigger_price:2001,trigger_seen:false},group,{price:1999}),null);
});
test('un prix absent ne déclenche aucune entrée',()=>{
 assert.equal(evaluateEntryTrigger({entry_price:2000},{direction:'BUY',order_type:'BUY LIMIT'},{bid:2000,ask:2000.2}),null);
});

test('le calcul P/L utilise le prix d’activation enregistré plutôt que le prix indicatif',async()=>{
 const {calculateInternalClosePnl}=await import('../netlify/functions/trade-watch.mjs');
 const p={volume_remaining:0.1,entry_price:2000,activation_price:2002,contract_size:100,quote_to_account:1,fees_per_lot:0};
 assert.deepEqual(calculateInternalClosePnl(p,'BUY',2010),{gross:80,fees:0,net:80,volume:0.1});
});
test('la migration autorise PENDING et réserve l’activation au worker service_role',async()=>{
 const {readFile}=await import('node:fs/promises');
 const sql=await readFile(new URL('../supabase/migrations/20261112180000_trade_entry_price_activation.sql',import.meta.url),'utf8');
 assert.match(sql,/PENDING.*OPEN.*CLOSED.*CANCELLED/s);
 assert.match(sql,/aurevia_activate_pending_position_worker/);
 assert.match(sql,/grant execute .* to service_role/i);
 assert.match(sql,/revoke all .*authenticated/i);
 assert.match(sql,/aurevia_market_quotes/);
});
