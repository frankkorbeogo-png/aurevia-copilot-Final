const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
async function rest(path,{method='GET',body,prefer}={}){const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!base||!key)throw new Error('Supabase service credentials unavailable.');const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();if(!r.ok)throw new Error(`Supabase REST ${r.status}: ${text.slice(0,200)}`);return text?JSON.parse(text):null;}
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
 const expected=process.env.TELEGRAM_WEBHOOK_SECRET,received=event.headers?.['x-telegram-bot-api-secret-token']||event.headers?.['X-Telegram-Bot-Api-Secret-Token'];if(!expected||received!==expected)return json(401,{error:'Unauthorized webhook.'});
 let update;try{update=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid JSON.'});}
 const message=update.message;if(!message?.text||!message.chat?.id||message.chat.type!=='private'||message.from?.is_bot||String(message.from?.id)!==String(message.chat.id))return json(200,{ok:true,ignored:true});
 const match=message.text.trim().match(/^\/start\s+([A-Z0-9]{6,12})$/i);if(!match)return json(200,{ok:true,ignored:true});
 const code=match[1].toUpperCase(),token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return json(503,{error:'Telegram bot not configured.'});
 try{
  const prefs=await rest(`user_preferences?select=user_id,preferences&preferences->>telegram_pair_code=eq.${encodeURIComponent(code)}`);
  const row=prefs?.[0],expires=row?.preferences?.telegram_pair_expires_at?Date.parse(row.preferences.telegram_pair_expires_at):0;
  if(!row||!Number.isFinite(expires)||expires<Date.now())return json(200,{ok:true,paired:false,reason:'code_invalid_or_expired'});
  const chatOwners=await rest(`telegram_connections?select=user_id&chat_id=eq.${encodeURIComponent(String(message.chat.id))}`);
  if(chatOwners?.some(owner=>owner.user_id!==row.user_id)){await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:message.chat.id,text:'Cette conversation Telegram est déjà associée à un autre compte AUREVIA. Elle ne peut pas être partagée.'})});return json(409,{ok:true,paired:false,reason:'chat_already_linked'});}
  await rest('telegram_connections?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{user_id:row.user_id,chat_id:String(message.chat.id),username:message.from?.username||null,connected_at:new Date().toISOString(),updated_at:new Date().toISOString()}});
  const old=row.preferences||{};const next={...old};delete next.telegram_pair_code;delete next.telegram_pair_expires_at;
  await rest(`user_preferences?user_id=eq.${row.user_id}`,{method:'PATCH',prefer:'return=minimal',body:{preferences:next,updated_at:new Date().toISOString()}});
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:message.chat.id,text:'Votre compte AUREVIA COPILOT est maintenant associé. Vous recevrez uniquement vos propres notifications.'})});
  return json(200,{ok:true,paired:true});
 }catch{return json(500,{error:'Pairing failed.'});}
}
