// Scheduled AUREVIA-only position monitor. It never connects to a broker or places orders.
const BASE=()=>process.env.SUPABASE_URL, KEY=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
async function rest(path,{method='GET',body,prefer}={}){const r=await fetch(`${BASE()}/rest/v1/${path}`,{method,headers:{apikey:KEY(),authorization:`Bearer ${KEY()}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,180)}`);return t?JSON.parse(t):null;}
const SYMBOLS=new Set(['XAU/USD','XAG/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','BTC/USD','ETH/USD']);
async function quote(symbol){if(!SYMBOLS.has(symbol))throw new Error('Instrument non pris en charge par le flux de surveillance.');const u=new URL('https://api.twelvedata.com/price');u.searchParams.set('symbol',symbol);u.searchParams.set('apikey',process.env.TWELVEDATA_API_KEY||'');const r=await fetch(u,{signal:AbortSignal.timeout(10000)});const d=await r.json();const p=Number(d.price);if(!r.ok||d.status==='error'||!Number.isFinite(p))throw new Error(d.message||'Prix indisponible');return p;}
export function evaluatePositionThreshold(position,price){
 const observed=Number(price), stop=Number(position?.stop_loss), target=Number(position?.take_profit);
 if(!Number.isFinite(observed)||observed<=0||!Number.isFinite(stop)||stop<=0||!Number.isFinite(target)||target<=0) return null;
 if(position?.direction!=='BUY'&&position?.direction!=='SELL') return null;
 const buy=position.direction==='BUY';
 const sl=buy?observed<=stop:observed>=stop;
 const tp=buy?observed>=target:observed<=target;
 return sl?'SL':tp?'TP':null;
}
export function calculateInternalClosePnl(position,direction,price){
 const volume=Number(position.volume_remaining),entry=Number(position.entry_price),contract=Number(position.contract_size),fx=Number(position.quote_to_account),feesPerLot=Number(position.fees_per_lot??0);
 if(!Number.isFinite(volume)||volume<=0||!Number.isFinite(entry)||entry<=0||!Number.isFinite(contract)||contract<=0||!Number.isFinite(fx)||fx<=0||!Number.isFinite(feesPerLot)||feesPerLot<0) throw new Error('Métadonnées de calcul P/L incomplètes : clôture automatique suspendue pour éviter un résultat fictif.');
 const gross=(direction==='BUY'?(price-entry):(entry-price))*volume*contract*fx;
 const fees=volume*feesPerLot;
 return {gross,fees,net:gross-fees,volume};
}
export function formatTradeAlertMessage(event,position,group){
 const label=event.event_type==='TP'?'TAKE PROFIT ATTEINT':'STOP LOSS ATTEINT';
 const volume=Number(event.closed_volume);
 return `AUREVIA COPILOT · ${label}\n${group.instrument} · ${group.direction}\n${position.tp_label||'Position'}\nPrix observé : ${event.observed_price}\nVolume interne clôturé : ${Number.isFinite(volume)?volume:'non renseigné'}\nClôture enregistrée dans AUREVIA uniquement. Aucune exécution broker.`;
}
async function telegram(userId,text){const rows=await rest(`telegram_connections?select=chat_id,notify_validated_signals&user_id=eq.${encodeURIComponent(userId)}`);const c=rows?.[0];if(!c?.chat_id||!c.notify_validated_signals)return {sent:false,suppressed:true,reason:!c?.chat_id?'chat_not_connected':'notifications_disabled'};const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('Telegram non configuré');const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:c.chat_id,text,disable_web_page_preview:true})});const d=await r.json();if(!r.ok||!d.ok)throw new Error('Telegram send failed');return {sent:true};}
async function deliverPending(){
 // The database claims rows with FOR UPDATE SKIP LOCKED. A second worker cannot
 // deliver the same event while the first owns its five-minute lease.
 const claimed=await rest('rpc/aurevia_claim_trade_alert_events',{method:'POST',body:{p_limit:50}});let sent=0;
 for(const e of claimed||[]){let delivered=false,suppressed=false;try{const ps=await rest(`trading_positions?select=id,group_id,tp_label,entry_price,volume_initial,volume_remaining,journal_id&id=eq.${e.position_id}`);const p=ps?.[0];if(!p)throw new Error('Position associée introuvable');
  // Never send a TP/SL notification until the matching close ledger row exists.
  // This also handles an ambiguous network timeout after the SQL transaction committed.
  const closes=await rest(`trading_position_closes?select=id,position_id,user_id,volume,exit_price,net_pnl&id=eq.${encodeURIComponent(e.id)}&position_id=eq.${encodeURIComponent(e.position_id)}&user_id=eq.${encodeURIComponent(e.user_id)}`);
  if(!closes?.length) throw new Error('Clôture interne non confirmée : notification conservée en attente.');
  const gs=await rest(`trading_position_groups?select=instrument,direction&id=eq.${p.group_id}`);const g=gs?.[0];if(!g)throw new Error('Groupe associé introuvable');
  const message=formatTradeAlertMessage({...e,closed_volume:closes[0].volume,observed_price:closes[0].exit_price},p,g);
  const delivery=await telegram(e.user_id,message);delivered=Boolean(delivery.sent);suppressed=Boolean(delivery.suppressed);if(delivered)sent++;
 }catch{ /* A failed send is returned to pending for a later retry. */}
  if(suppressed){await rest(`aurevia_trade_alert_events?id=eq.${e.id}&status=eq.processing`,{method:'PATCH',body:{status:'cancelled',locked_at:null},prefer:'return=minimal'});}
  else await rest('rpc/aurevia_finish_trade_alert_event',{method:'POST',body:{p_event_id:e.id,p_sent:delivered}});
 }
 return sent;
}
export async function handler(event){
 if(!BASE()||!KEY()||!process.env.TWELVEDATA_API_KEY)return json(503,{error:'Surveillance non configurée côté serveur.'});
 try{
  const positions=await rest('trading_positions?select=id,user_id,group_id,tp_label,entry_price,stop_loss,take_profit,volume_remaining,contract_size,quote_to_account,fees_per_lot,journal_id,status&status=eq.OPEN&volume_remaining=gt.0');
  // PostgREST embedded relationship syntax can differ by FK names; use a second, explicit groups read for portable joins.
  const groups=await rest('trading_position_groups?select=id,user_id,instrument,direction,mode,status&status=eq.OPEN');
  const byId=new Map(groups.map(g=>[g.id,g]));
  let checked=0,triggered=0,errors=[];const priceCache=new Map();
  for(const p of positions||[]){const g=byId.get(p.group_id);if(!g)continue;const instrument=g.instrument;try{
    let price=priceCache.get(instrument);if(price===undefined){price=await quote(instrument);priceCache.set(instrument,price);}checked++;
    const eventType=evaluatePositionThreshold({...p,direction:g.direction},price);if(!eventType)continue;
    // Unique event row makes the notification idempotent across scheduled invocations.
    const eventId=`${p.id}:${eventType}`;const inserted=await rest('aurevia_trade_alert_events?on_conflict=event_key',{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:{event_key:eventId,position_id:p.id,user_id:p.user_id,event_type:eventType,observed_price:price,closed_volume:Number(p.volume_remaining),status:'pending'}});
    let alert=inserted?.[0];if(!alert){const prior=await rest(`aurevia_trade_alert_events?select=id,status,event_key&event_key=eq.${encodeURIComponent(eventId)}`);alert=prior?.[0];}if(!alert||alert.status==='sent')continue;
    let pnl;
    try {
      pnl=calculateInternalClosePnl(p,g.direction,price);
    } catch (calculationError) {
      // A pending notification must never be sent for a close that was not recorded.
      // Cancel this event; the next monitor pass can create a fresh event after metadata is fixed.
      await rest(`aurevia_trade_alert_events?id=eq.${alert.id}&status=eq.pending`, {
        method:'PATCH', body:{status:'cancelled'}, prefer:'return=minimal'
      });
      throw calculationError;
    }
    const {volume,gross,fees,net}=pnl;
    // A prior attempt may have cancelled this unique event because P/L metadata
    // was missing. Once metadata is valid, reactivate that same durable event so
    // its key does not permanently block a later legitimate TP/SL close.
    if(alert.status==='cancelled'){
      const reactivated=await rest(`aurevia_trade_alert_events?id=eq.${alert.id}&status=eq.cancelled`,{
        method:'PATCH',body:{status:'pending',locked_at:null},prefer:'return=representation'
      });
      if(!reactivated?.length) continue;
      alert={...alert,status:'pending'};
    }
    // The position is marked closed inside AUREVIA only; this is not broker execution.
    const closedAt=new Date().toISOString();
    // One privileged SQL transaction updates the close event, position, linked journal and group.
    // The worker RPC is service_role-only; browser users cannot invoke it.
    await rest('rpc/aurevia_record_position_close_worker',{method:'POST',body:{
      p_close_id:alert.id,p_position_id:p.id,p_volume:volume,p_exit_price:price,
      p_gross_pnl:gross,p_fees:fees,p_net_pnl:net,
      p_closed_at:closedAt,p_user_id:p.user_id
    }});
    // Notification is delivered from the durable pending queue below; retries survive Telegram downtime.
    triggered++;
   }catch(e){errors.push({position_id:p.id,error:e.message});}
  }
  const notificationsSent=await deliverPending();
  return json(200,{ok:true,checked,triggered,notificationsSent,errors});
 }catch(e){return json(500,{error:'Surveillance des positions impossible.',detail:e.message});}
}
