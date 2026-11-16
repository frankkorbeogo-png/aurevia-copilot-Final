// Persistent Twelve Data WebSocket quote worker for AUREVIA COPILOT.
import {evaluateEntryTrigger,isPendingOrderExpired} from '../netlify/functions/_trade-entry-trigger.mjs';
import {MARKET_LABELS} from '../market-catalog.js';
// Run as an always-on Node 22 service (not as a Netlify scheduled function).
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TWELVEDATA_API_KEY'];
for(const key of required)if(!process.env[key])throw new Error(`Variable requise absente : ${key}`);
if(typeof WebSocket==='undefined')throw new Error('Node 22+ avec WebSocket global est requis.');
const base=process.env.SUPABASE_URL.replace(/\/$/,''),service=process.env.SUPABASE_SERVICE_ROLE_KEY,apiKey=process.env.TWELVEDATA_API_KEY;
const allowed=new Set(MARKET_LABELS);
const active=new Set(),pendingBySymbol=new Map(),lastPersistAt=new Map(),processingBySymbol=new Map();let socket=null,reconnectDelay=2000,stopped=false;
async function rest(path,{method='GET',body,prefer}={}){const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:service,authorization:`Bearer ${service}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,200)}`);return t?JSON.parse(t):null;}
async function loadActiveState(){const [groups,positions]=await Promise.all([rest('trading_position_groups?select=id,instrument,direction,order_type&status=eq.OPEN'),rest('trading_positions?select=id,user_id,group_id,entry_price,trigger_price,trigger_seen,entry_armed,last_observed_price,expires_at,status&status=eq.PENDING&volume_remaining=gt.0')]);const groupById=new Map((groups||[]).map(g=>[g.id,g]));pendingBySymbol.clear();for(const p of positions||[]){const g=groupById.get(p.group_id);if(!g||!allowed.has(g.instrument))continue;const list=pendingBySymbol.get(g.instrument)||[];list.push({...p,group:g});pendingBySymbol.set(g.instrument,list);}return [...new Set((groups||[]).map(x=>x.instrument).filter(x=>allowed.has(x)))];}
function send(action,symbols){if(socket?.readyState===WebSocket.OPEN&&symbols.length)socket.send(JSON.stringify({action,params:{symbols:symbols.join(',')}}));}
async function processPendingTick(symbol,prices){
 for(const p of pendingBySymbol.get(symbol)||[]){
  if(p.status!=='PENDING')continue;
  const now=Date.now();
  if(isPendingOrderExpired(p,now)){
   const expired=await rest('rpc/aurevia_expire_pending_position_worker',{method:'POST',body:{p_position_id:p.id,p_user_id:p.user_id,p_expired_at:new Date(now).toISOString()}});
   if(expired?.ok&&expired.expired)p.status='CLOSED';
   continue;
  }
  const state=evaluateEntryTrigger(p,p.group,prices);
  if(!state)continue;
  if(state.action==='TRACK'){
   const patch={last_observed_price:state.last_observed_price,entry_armed:Boolean(state.entry_armed),updated_at:new Date().toISOString()};
   const changed=await rest(`trading_positions?id=eq.${p.id}&status=eq.PENDING`,{method:'PATCH',body:patch,prefer:'return=representation'});
   if(changed?.length)Object.assign(p,patch);
   continue;
  }
  if(state.action==='TRIGGER_SEEN'){
   const patch={trigger_seen:true,last_observed_price:state.last_observed_price,entry_armed:Boolean(state.entry_armed),updated_at:new Date().toISOString()};
   const changed=await rest(`trading_positions?id=eq.${p.id}&status=eq.PENDING&trigger_seen=eq.false`,{method:'PATCH',body:patch,prefer:'return=representation'});
   if(changed?.length)Object.assign(p,patch);
   else p.trigger_seen=true;
   continue;
  }
  if(state.action!=='ACTIVATE')continue;
  const activationPrice=prices.price,activatedAt=new Date().toISOString();
  const result=await rest('rpc/aurevia_activate_pending_position_worker',{method:'POST',body:{p_position_id:p.id,p_user_id:p.user_id,p_activation_price:activationPrice,p_activated_at:activatedAt}});
  if(result?.ok&&result.status==='OPEN'){
   p.status='OPEN';
   console.log(`[AUREVIA_ENTRY] ${p.group.direction} ${symbol} activated at ${activationPrice}`);
  }else if(result?.status==='EXPIRED'){
   const expired=await rest('rpc/aurevia_expire_pending_position_worker',{method:'POST',body:{p_position_id:p.id,p_user_id:p.user_id,p_expired_at:activatedAt}});
   if(expired?.ok&&expired.expired)p.status='CLOSED';
  }
 }
}
async function storeQuote(d){
 const price=Number(d.price),symbol=d.symbol,stamp=Number(d.timestamp);
 if(!allowed.has(symbol)||!Number.isFinite(price)||price<=0||!Number.isFinite(stamp)||stamp<=0)return;
 const quoteDate=new Date(stamp*1000),age=Date.now()-quoteDate.getTime();
 // A websocket message without a valid provider timestamp is never used to arm,
 // activate, or monitor a position; the server clock is not a substitute.
 if(!Number.isFinite(quoteDate.getTime())||age<0||age>120000)return;
 const quoteAt=quoteDate.toISOString(),prices={price,quoteAt};
 const previous=processingBySymbol.get(symbol)||Promise.resolve();
 const current=previous.catch(()=>{}).then(()=>processPendingTick(symbol,prices));
 processingBySymbol.set(symbol,current);
 try{await current;}finally{if(processingBySymbol.get(symbol)===current)processingBySymbol.delete(symbol);}
 const now=Date.now();
 if(now-(lastPersistAt.get(symbol)||0)>=1000){
  await rest('aurevia_market_quotes?on_conflict=symbol',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{symbol,price,quote_at:quoteAt,source:'Twelve Data WebSocket Last Price · timestamp verified',updated_at:new Date().toISOString()}});
  lastPersistAt.set(symbol,now);
 }
}
async function syncSubscriptions(){try{const symbols=await loadActiveState();if(socket?.readyState!==WebSocket.OPEN)return;const next=new Set(symbols),added=[...next].filter(x=>!active.has(x)),removed=[...active].filter(x=>!next.has(x));send('unsubscribe',removed);send('subscribe',added);for(const x of removed)active.delete(x);for(const x of added)active.add(x);}catch(e){console.error('[AUREVIA_QUOTES] subscription refresh failed:',e.message);}}
function connect(){if(stopped)return;const url=`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(apiKey)}`;socket=new WebSocket(url);
 socket.addEventListener('open',async()=>{console.log('[AUREVIA_QUOTES] connected');reconnectDelay=2000;await syncSubscriptions();});
 socket.addEventListener('message',event=>{try{const d=JSON.parse(String(event.data));if(d.event==='price')storeQuote(d).catch(e=>console.error('[AUREVIA_QUOTES] quote write failed:',e.message));else if(d.event==='subscribe-status'&&d.fails?.length)console.error('[AUREVIA_QUOTES] subscription failures:',JSON.stringify(d.fails));else if(d.status==='error')console.error('[AUREVIA_QUOTES] provider error:',d.message||d); }catch(e){console.error('[AUREVIA_QUOTES] invalid message:',e.message);}});
 socket.addEventListener('error',()=>console.error('[AUREVIA_QUOTES] websocket error'));
 socket.addEventListener('close',()=>{console.warn('[AUREVIA_QUOTES] disconnected; reconnect scheduled');socket=null;for(const x of [...active])active.delete(x);if(!stopped){setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(reconnectDelay*2,30000);}});
}
const refresh=setInterval(syncSubscriptions,15000),heartbeat=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({action:'heartbeat'}));},10000);
process.on('SIGTERM',()=>{stopped=true;clearInterval(refresh);clearInterval(heartbeat);socket?.close();process.exit(0);});
process.on('SIGINT',()=>{stopped=true;clearInterval(refresh);clearInterval(heartbeat);socket?.close();process.exit(0);});
connect();
