import { calculateContractPnl } from '../../contract-engine.js';
// Scheduled AUREVIA-only position monitor. It never connects to a broker or places orders.
const BASE=()=>process.env.SUPABASE_URL, KEY=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
async function rest(path,{method='GET',body,prefer}={}){const r=await fetch(`${BASE()}/rest/v1/${path}`,{method,headers:{apikey:KEY(),authorization:`Bearer ${KEY()}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,180)}`);return t?JSON.parse(t):null;}
const SYMBOLS=new Set(['XAU/USD','XAG/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','BTC/USD','ETH/USD']);
async function quote(symbol){
 if(!SYMBOLS.has(symbol))throw new Error('Instrument non pris en charge par le suivi.');
 const rows=await rest(`aurevia_market_quotes?select=price,quote_at,source&symbol=eq.${encodeURIComponent(symbol)}`);
 const row=rows?.[0],stored=Number(row?.price),age=Date.now()-Date.parse(row?.quote_at||'');
 if(row&&Number.isFinite(stored)&&stored>0&&Number.isFinite(age)&&age>=0&&age<=90000)return {price:stored,quoteAt:row.quote_at,source:row.source||'flux marché'};
 const key=process.env.TWELVEDATA_API_KEY;if(!key)throw new Error('Prix de marché indisponible : flux absent ou trop ancien.');
 const url=new URL('https://api.twelvedata.com/price');url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',key);url.searchParams.set('format','JSON');
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)}),data=await response.json(),price=Number(data.price);
 if(!response.ok||data.status==='error'||!Number.isFinite(price)||price<=0)throw new Error(data.message||'Prix de marché Twelve Data indisponible.');
 const quoteAt=new Date().toISOString();
 await rest('aurevia_market_quotes?on_conflict=symbol',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{symbol,price,quote_at:quoteAt,source:'Twelve Data REST Last Price',updated_at:quoteAt}});
 return {price,quoteAt,source:'Twelve Data REST Last Price'};
}
export {evaluateEntryTrigger} from './_trade-entry-trigger.mjs';
import {evaluateEntryTrigger} from './_trade-entry-trigger.mjs';
export function evaluatePositionThreshold(position,price){
 const observed=Number(price),stop=Number(position?.stop_loss),target=Number(position?.take_profit);
 if(!Number.isFinite(observed)||observed<=0||!Number.isFinite(stop)||stop<=0||!Number.isFinite(target)||target<=0)return null;
 if(position?.direction!=='BUY'&&position?.direction!=='SELL')return null;
 const buy=position.direction==='BUY',sl=buy?observed<=stop:observed>=stop,tp=buy?observed>=target:observed<=target;
 return sl?'SL':tp?'TP':null;
}
export function calculateInternalClosePnl(position,direction,price){
 const volume=Number(position.volume_remaining),entry=Number(position.activation_price??position.entry_price);
 if(!Number.isFinite(volume)||volume<=0||!Number.isFinite(entry)||entry<=0)throw new Error('Volume ou prix d’entrée invalide : clôture automatique suspendue.');
 const contractSpec=position.contract_spec||{calculationType:'contract',contractSize:Number(position.contract_size),quoteToAccount:Number(position.quote_to_account),feesPerLot:Number(position.fees_per_lot??0),minLot:0.00000001,lotStep:0.00000001};
 let pnl;try{pnl=calculateContractPnl({direction,entry,exit:Number(price),volume,contractSpec});}catch(error){throw new Error(`Métadonnées de calcul P/L incomplètes : ${error.message}`);}
 const {currency,...values}=pnl;return {...values,...(currency?{currency}:{}),volume};
}
export function formatTradeAlertMessage(event,position,group){
 const label=event.event_type==='TP'?'TAKE PROFIT ATTEINT':'STOP LOSS ATTEINT',volume=Number(event.closed_volume);
 return `AUREVIA COPILOT · ${label}\n${group.instrument} · ${group.direction}\n${position.tp_label||'Position'}\nPrix observé : ${event.observed_price}\nVolume interne clôturé : ${Number.isFinite(volume)?volume:'non renseigné'}\nClôture enregistrée dans AUREVIA uniquement. Aucune exécution broker.`;
}
async function telegram(userId,text){const rows=await rest(`telegram_connections?select=chat_id,notify_validated_signals&user_id=eq.${encodeURIComponent(userId)}`);const c=rows?.[0];if(!c?.chat_id||!c.notify_validated_signals)return {sent:false,suppressed:true,reason:!c?.chat_id?'chat_not_connected':'notifications_disabled'};const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('Telegram non configuré');const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:c.chat_id,text,disable_web_page_preview:true})});const d=await r.json();if(!r.ok||!d.ok)throw new Error('Telegram send failed');return {sent:true};}
async function deliverEntryNotifications(positions,groups){let sent=0;for(const p of positions.filter(x=>x.status==='OPEN'&&x.activated_at&&!x.activation_notified)){try{const g=groups.get(p.group_id);if(!g)continue;const result=await telegram(p.user_id,`AUREVIA COPILOT · ENTRÉE DÉCLENCHÉE\n${g.instrument} · ${g.direction}\nPrix d’entrée prévu : ${p.entry_price}\nPrix de marché observé : ${p.activation_price}\nHeure : ${p.activated_at}\nSurveillance TP/SL activée dans AUREVIA. Aucun ordre broker n’a été exécuté.`);if(result.sent)sent++;if(result.sent||result.suppressed)await rest(`trading_positions?id=eq.${p.id}&activation_notified=eq.false`,{method:'PATCH',body:{activation_notified:true},prefer:'return=minimal'});}catch{/* Retry at the next scheduled pass. */}}return sent;}
async function deliverPending(){
 const claimed=await rest('rpc/aurevia_claim_trade_alert_events',{method:'POST',body:{p_limit:50}});let sent=0;
 for(const e of claimed||[]){let delivered=false,suppressed=false;try{const ps=await rest(`trading_positions?select=id,group_id,tp_label,entry_price,volume_initial,volume_remaining,journal_id&id=eq.${e.position_id}`);const p=ps?.[0];if(!p)throw new Error('Position associée introuvable');
  const closes=await rest(`trading_position_closes?select=id,position_id,user_id,volume,exit_price,net_pnl&id=eq.${encodeURIComponent(e.id)}&position_id=eq.${encodeURIComponent(e.position_id)}&user_id=eq.${encodeURIComponent(e.user_id)}`);if(!closes?.length)throw new Error('Clôture interne non confirmée : notification conservée en attente.');
  const gs=await rest(`trading_position_groups?select=instrument,direction&id=eq.${p.group_id}`);const g=gs?.[0];if(!g)throw new Error('Groupe associé introuvable');
  const delivery=await telegram(e.user_id,formatTradeAlertMessage({...e,closed_volume:closes[0].volume,observed_price:closes[0].exit_price},p,g));delivered=Boolean(delivery.sent);suppressed=Boolean(delivery.suppressed);if(delivered)sent++;
 }catch{/* A failed send is returned to pending for a later retry. */}
  if(suppressed)await rest(`aurevia_trade_alert_events?id=eq.${e.id}&status=eq.processing`,{method:'PATCH',body:{status:'cancelled',locked_at:null},prefer:'return=minimal'});
  else await rest('rpc/aurevia_finish_trade_alert_event',{method:'POST',body:{p_event_id:e.id,p_sent:delivered}});
 }
 return sent;
}
export async function handler(event){
 if(!BASE()||!KEY())return json(503,{error:'Surveillance non configurée côté serveur.'});
 try{
  const positions=await rest('trading_positions?select=id,user_id,group_id,tp_label,entry_price,stop_loss,take_profit,trigger_price,trigger_seen,activated_at,activation_price,activation_notified,volume_remaining,contract_size,quote_to_account,fees_per_lot,contract_spec,journal_id,status&status=in.(PENDING,OPEN)&volume_remaining=gt.0');
  const groups=await rest('trading_position_groups?select=id,user_id,instrument,direction,order_type,mode,status&status=eq.OPEN');const byId=new Map(groups.map(g=>[g.id,g]));
  let checked=0,activated=0,triggerStages=0,triggered=0,errors=[];const priceCache=new Map();
  for(const p of positions||[]){const g=byId.get(p.group_id);if(!g)continue;try{
    let prices=priceCache.get(g.instrument);if(!prices){prices=await quote(g.instrument);priceCache.set(g.instrument,prices);}checked++;
    const observedPrice=prices.price;
    if(p.status==='PENDING'){
      const state=evaluateEntryTrigger(p,g,prices);if(!state)continue;
      if(state==='TRIGGER_SEEN'){
        const changed=await rest(`trading_positions?id=eq.${p.id}&status=eq.PENDING&trigger_seen=eq.false`,{method:'PATCH',body:{trigger_seen:true,updated_at:new Date().toISOString()},prefer:'return=representation'});if(changed?.length)triggerStages++;continue;
      }
      const activationPrice=observedPrice;
      await rest('rpc/aurevia_activate_pending_position_worker',{method:'POST',body:{p_position_id:p.id,p_user_id:p.user_id,p_activation_price:activationPrice,p_activated_at:new Date().toISOString()}});activated++;continue;
    }
    // Internal TP/SL is evaluated against the single observed Last Price. This is not a broker execution price.
    const exitPrice=observedPrice;
    const eventType=evaluatePositionThreshold({...p,direction:g.direction},exitPrice);if(!eventType)continue;
    const eventId=`${p.id}:${eventType}`;const inserted=await rest('aurevia_trade_alert_events?on_conflict=event_key',{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:{event_key:eventId,position_id:p.id,user_id:p.user_id,event_type:eventType,observed_price:exitPrice,closed_volume:Number(p.volume_remaining),status:'pending'}});
    let alert=inserted?.[0];if(!alert){const prior=await rest(`aurevia_trade_alert_events?select=id,status,event_key&event_key=eq.${encodeURIComponent(eventId)}`);alert=prior?.[0];}if(!alert||alert.status==='sent')continue;
    let pnl;try{pnl=calculateInternalClosePnl(p,g.direction,exitPrice);}catch(calculationError){await rest(`aurevia_trade_alert_events?id=eq.${alert.id}&status=eq.pending`,{method:'PATCH',body:{status:'cancelled'},prefer:'return=minimal'});throw calculationError;}
    const {volume,gross,fees,net}=pnl;
    if(alert.status==='cancelled'){const reactivated=await rest(`aurevia_trade_alert_events?id=eq.${alert.id}&status=eq.cancelled`,{method:'PATCH',body:{status:'pending',locked_at:null},prefer:'return=representation'});if(!reactivated?.length)continue;alert={...alert,status:'pending'};}
    await rest('rpc/aurevia_record_position_close_worker',{method:'POST',body:{p_close_id:alert.id,p_position_id:p.id,p_volume:volume,p_exit_price:exitPrice,p_gross_pnl:gross,p_fees:fees,p_net_pnl:net,p_closed_at:new Date().toISOString(),p_user_id:p.user_id}});triggered++;
   }catch(e){errors.push({position_id:p.id,error:e.message});}
  }
  const notificationsSent=await deliverPending();const entryNotificationsSent=await deliverEntryNotifications(positions,byId);
  return json(200,{ok:true,checked,activated,triggerStages,triggered,notificationsSent,entryNotificationsSent,errors});
 }catch(e){return json(500,{error:'Surveillance des positions impossible.',detail:e.message});}
}
