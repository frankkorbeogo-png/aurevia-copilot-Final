// Scheduled AUREVIA-only position monitor. It never connects to a broker or places orders.
const BASE=()=>process.env.SUPABASE_URL, KEY=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
async function rest(path,{method='GET',body,prefer}={}){const r=await fetch(`${BASE()}/rest/v1/${path}`,{method,headers:{apikey:KEY(),authorization:`Bearer ${KEY()}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,180)}`);return t?JSON.parse(t):null;}
const SYMBOLS=new Set(['XAU/USD','XAG/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','BTC/USD','ETH/USD']);
async function quote(symbol){if(!SYMBOLS.has(symbol))throw new Error('Instrument non pris en charge par le flux de surveillance.');const u=new URL('https://api.twelvedata.com/price');u.searchParams.set('symbol',symbol);u.searchParams.set('apikey',process.env.TWELVEDATA_API_KEY||'');const r=await fetch(u,{signal:AbortSignal.timeout(10000)});const d=await r.json();const p=Number(d.price);if(!r.ok||d.status==='error'||!Number.isFinite(p))throw new Error(d.message||'Prix indisponible');return p;}
export function evaluatePositionThreshold(position,price){const buy=position.direction==='BUY';const sl=buy?price<=Number(position.stop_loss):price>=Number(position.stop_loss);const tp=buy?price>=Number(position.take_profit):price<=Number(position.take_profit);return sl?'SL':tp?'TP':null;}
async function telegram(userId,text){const rows=await rest(`telegram_connections?select=chat_id,notify_validated_signals&user_id=eq.${encodeURIComponent(userId)}`);const c=rows?.[0];if(!c?.chat_id||!c.notify_validated_signals)return {sent:false};const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('Telegram non configuré');const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:c.chat_id,text,disable_web_page_preview:true})});const d=await r.json();if(!r.ok||!d.ok)throw new Error('Telegram send failed');return {sent:true};}
async function deliverPending(){
 const pending=await rest('aurevia_trade_alert_events?select=id,event_key,position_id,user_id,event_type,observed_price,closed_volume&status=eq.pending&order=created_at.asc&limit=100');let sent=0;
 for(const e of pending||[]){try{const ps=await rest(`trading_positions?select=id,group_id,tp_label,entry_price,volume_initial,volume_remaining,journal_id&id=eq.${e.position_id}`);const p=ps?.[0];if(!p)continue;const gs=await rest(`trading_position_groups?select=instrument,direction&id=eq.${p.group_id}`);const g=gs?.[0];if(!g)continue;
  const message=`AUREVIA COPILOT · ${e.event_type==='TP'?'TAKE PROFIT ATTEINT':'STOP LOSS ATTEINT'}\n${g.instrument} · ${g.direction}\n${p.tp_label||'Position'}\nPrix observé : ${e.observed_price}\nVolume interne clôturé : ${p.volume_initial}\nClôture enregistrée dans AUREVIA uniquement. Aucune exécution broker.`;
  await telegram(e.user_id,message);await rest(`aurevia_trade_alert_events?id=eq.${e.id}`,{method:'PATCH',prefer:'return=minimal',body:{status:'sent',sent_at:new Date().toISOString()}});sent++;
 }catch{ /* Keep pending; next scheduled invocation retries. */}}
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
    const volume=Number(p.volume_remaining),entry=Number(p.entry_price),contract=Number(p.contract_size),fx=Number(p.quote_to_account||1),fees=volume*Number(p.fees_per_lot||0);
    const gross=Number.isFinite(contract)&&contract>0?(g.direction==='BUY'?(price-entry):(entry-price))*volume*contract*fx:null;
    // The position is marked closed inside AUREVIA only; this is not broker execution.
    const closePatch={volume_remaining:0,status:'CLOSED',closed_at:new Date().toISOString(),updated_at:new Date().toISOString(),...(gross===null?{}:{gross_pnl:gross,fees,net_pnl:gross-fees})};
    const updated=await rest(`trading_positions?id=eq.${p.id}&user_id=eq.${p.user_id}&status=eq.OPEN&volume_remaining=gt.0`,{method:'PATCH',prefer:'return=representation',body:closePatch});
    if(!updated?.length){await rest(`aurevia_trade_alert_events?event_key=eq.${encodeURIComponent(eventId)}`,{method:'PATCH',prefer:'return=minimal',body:{status:'cancelled'}});continue;}
    await rest('trading_position_closes?on_conflict=id',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:{id:crypto.randomUUID(),position_id:p.id,user_id:p.user_id,volume,exit_price:price,gross_pnl:gross??0,fees:gross===null?0:fees,net_pnl:gross===null?0:gross-fees,closed_at:new Date().toISOString()}});
    if(p.journal_id){const siblings=await rest(`trading_positions?select=status,net_pnl,volume_remaining&group_id=eq.${p.group_id}`);const allClosed=siblings.length>0&&siblings.every(x=>x.status==='CLOSED');const net=g.mode==='unique'?siblings.reduce((sum,x)=>sum+Number(x.net_pnl||0),0):(gross===null?0:gross-fees);const remaining=g.mode==='unique'?siblings.reduce((sum,x)=>sum+Number(x.volume_remaining||0),0):0;await rest(`trading_journal?id=eq.${p.journal_id}&user_id=eq.${p.user_id}`,{method:'PATCH',prefer:'return=minimal',body:{pnl:net,result:(g.mode==='unique'&&!allClosed)?'OPEN':(net>0?'WIN':net<0?'LOSS':'BREAKEVEN'),volume_remaining:remaining,closed_at:(g.mode==='unique'&&!allClosed)?null:new Date().toISOString(),updated_at:new Date().toISOString()}});}
    const remaining=await rest(`trading_positions?select=id&group_id=eq.${p.group_id}&status=eq.OPEN&volume_remaining=gt.0`);if(!remaining.length)await rest(`trading_position_groups?id=eq.${p.group_id}`,{method:'PATCH',prefer:'return=minimal',body:{status:'CLOSED',updated_at:new Date().toISOString()}});
    // Notification is delivered from the durable pending queue below; retries survive Telegram downtime.
    triggered++;
   }catch(e){errors.push({position_id:p.id,error:e.message});}
  }
  const notificationsSent=await deliverPending();
  return json(200,{ok:true,checked,triggered,notificationsSent,errors});
 }catch(e){return json(500,{error:'Surveillance des positions impossible.',detail:e.message});}
}
