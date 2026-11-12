// AUREVIA internal trigger rules based on one observed market price (Last Price).
export function evaluateEntryTrigger(position,group,prices){
 const observed=Number(prices?.price),entry=Number(position?.entry_price),trigger=Number(position?.trigger_price);
 if(!Number.isFinite(observed)||observed<=0||!Number.isFinite(entry)||entry<=0)return null;
 const direction=group?.direction,order=group?.order_type||group?.orderType;
 if(!['BUY','SELL'].includes(direction)||!['BUY LIMIT','BUY STOP','BUY STOP LIMIT','SELL LIMIT','SELL STOP','SELL STOP LIMIT'].includes(order))return null;
 const buy=direction==='BUY';
 if(order.endsWith('STOP LIMIT')){
  if(!position.trigger_seen){if(!Number.isFinite(trigger)||trigger<=0)return null;return (buy?observed>=trigger:observed<=trigger)?'TRIGGER_SEEN':null;}
  return (buy?observed<=entry:observed>=entry)?'ACTIVATE':null;
 }
 if(order.endsWith('LIMIT'))return (buy?observed<=entry:observed>=entry)?'ACTIVATE':null;
 return (buy?observed>=entry:observed<=entry)?'ACTIVATE':null;
}
