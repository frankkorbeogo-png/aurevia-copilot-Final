// Pending entries are activated only after an observed safe-side -> trigger-side crossing.
// The first quote initializes a baseline; it can never activate an order by itself.
export function evaluateEntryTrigger(position,group,prices){
 const observed=Number(prices?.price),entry=Number(position?.entry_price),trigger=Number(position?.trigger_price);
 if(!Number.isFinite(observed)||observed<=0||!Number.isFinite(entry)||entry<=0)return null;
 const direction=group?.direction,order=group?.order_type||group?.orderType;
 if(!['BUY','SELL'].includes(direction)||!['BUY LIMIT','BUY STOP','BUY STOP LIMIT','SELL LIMIT','SELL STOP','SELL STOP LIMIT'].includes(order)||((order.startsWith('BUY')&&direction!=='BUY')||(order.startsWith('SELL')&&direction!=='SELL')))return null;
 const buy=direction==='BUY',stopLimit=order.endsWith('STOP LIMIT');
 const plainStop=order==='BUY STOP'||order==='SELL STOP';
 const stopLeg=(stopLimit&&!position.trigger_seen)||plainStop;
 const threshold=stopLeg?trigger:entry;
 if(!Number.isFinite(threshold)||threshold<=0)return null;
 // For LIMIT entries, the safe side is above entry for BUY and below for SELL.
 // For STOP entries, it is below entry for BUY and above for SELL.
 const isLimit=stopLimit?Boolean(position.trigger_seen):order.endsWith('LIMIT');
 const safe=isLimit?(buy?observed>threshold:observed<threshold):(buy?observed<threshold:observed>threshold);
 const previous=Number(position.last_observed_price);
 const hasPrevious=Number.isFinite(previous)&&previous>0;
 if(!hasPrevious){
  return {action:'TRACK',last_observed_price:observed,entry_armed:safe};
 }
 const armed=Boolean(position.entry_armed);
 if(!armed){
  return {action:'TRACK',last_observed_price:observed,entry_armed:safe};
 }
 const crossed=safe?false:(isLimit?(buy?previous>threshold&&observed<=threshold:previous<threshold&&observed>=threshold):(buy?previous<threshold&&observed>=threshold:previous>threshold&&observed<=threshold));
 if(!crossed)return {action:'TRACK',last_observed_price:observed,entry_armed:true};
 if(stopLimit&&!position.trigger_seen){
  // The stop leg has fired. Start monitoring the limit leg from this quote.
  const limitSafe=buy?observed>entry:observed<entry;
  return {action:'TRIGGER_SEEN',last_observed_price:observed,entry_armed:limitSafe};
 }
 return {action:'ACTIVATE',last_observed_price:observed,entry_armed:true};
}

export function isPendingOrderExpired(position,now=Date.now()){
 const expiresAt=Date.parse(position?.expires_at??position?.expiresAt??'');
 const current=now instanceof Date?now.getTime():Number(now);
 return Number.isFinite(expiresAt)&&Number.isFinite(current)&&expiresAt>0&&expiresAt<=current;
}
