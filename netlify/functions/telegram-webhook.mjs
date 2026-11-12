const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
async function rest(path,{method='GET',body,prefer}={}){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error('Supabase service credentials unavailable.');
 const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();if(!r.ok)throw new Error(`Supabase REST ${r.status}: ${text.slice(0,200)}`);return text?JSON.parse(text):null;
}
async function telegramSend(token,chatId,text){
 const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||result.ok!==true)throw new Error(`Telegram sendMessage failed (HTTP ${response.status}).`);
 return result;
}
async function clearPendingCode(userId){
 const rows=await rest(`user_preferences?select=preferences&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
 const old=rows?.[0]?.preferences||{};const next={...old};delete next.telegram_pair_code;delete next.telegram_pair_expires_at;
 await rest(`user_preferences?user_id=eq.${encodeURIComponent(userId)}`,{method:'PATCH',prefer:'return=minimal',body:{preferences:next,updated_at:new Date().toISOString()}});
}
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
 const expected=process.env.TELEGRAM_WEBHOOK_SECRET,received=event.headers?.['x-telegram-bot-api-secret-token']||event.headers?.['X-Telegram-Bot-Api-Secret-Token'];
 if(!expected||received!==expected)return json(401,{error:'Unauthorized webhook.'});
 let update;try{update=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid JSON.'});}
 const message=update.message;
 if(!message?.text||!message.chat?.id||message.chat.type!=='private'||message.from?.is_bot||String(message.from?.id)!==String(message.chat.id))return json(200,{ok:true,ignored:true});
 const command=message.text.trim(),chatId=String(message.chat.id),token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token)return json(503,{error:'Telegram bot not configured.'});
 try{
  if(/^\/(stop|disconnect|deconnecter)(?:@[^\s]+)?(?:\s|$)/i.test(command)){
   const owners=await rest(`telegram_connections?select=user_id&chat_id=eq.${encodeURIComponent(chatId)}&limit=2`);
   if(!owners?.length){await telegramSend(token,chatId,'Aucun compte AUREVIA n’est associé à cette conversation.');return json(200,{ok:true,unlinked:false,reason:'not_linked'});}
   if(owners.length!==1)return json(409,{ok:false,error:'Cette conversation est associée à plusieurs comptes. Contactez le support.'});
   await rest(`telegram_connections?chat_id=eq.${encodeURIComponent(chatId)}`,{method:'DELETE',prefer:'return=minimal'});
   await clearPendingCode(owners[0].user_id);
   await telegramSend(token,chatId,'🔕 Notifications AUREVIA arrêtées. Votre compte Telegram est déconnecté. Pour les réactiver, retournez dans AUREVIA et générez un nouveau code de liaison.');
   return json(200,{ok:true,unlinked:true});
  }
  const match=command.match(/^\/start\s+([A-Z0-9]{6,12})$/i);if(!match)return json(200,{ok:true,ignored:true});
  const code=match[1].toUpperCase();
  const prefs=await rest(`user_preferences?select=user_id,preferences&preferences->>telegram_pair_code=eq.${encodeURIComponent(code)}&limit=2`);
  if(!Array.isArray(prefs)||prefs.length!==1)return json(200,{ok:true,paired:false,reason:prefs?.length>1?'ambiguous_code':'code_invalid_or_expired'});
  const row=prefs[0],expires=row?.preferences?.telegram_pair_expires_at?Date.parse(row.preferences.telegram_pair_expires_at):0;
  if(!row?.user_id||!Number.isFinite(expires)||expires<Date.now())return json(200,{ok:true,paired:false,reason:'code_invalid_or_expired'});
  const chatOwners=await rest(`telegram_connections?select=user_id&chat_id=eq.${encodeURIComponent(chatId)}&limit=2`);
  if(chatOwners?.some(owner=>owner.user_id!==row.user_id)){
   await telegramSend(token,chatId,'Cette conversation Telegram est déjà associée à un autre compte AUREVIA. Elle ne peut pas être partagée.');
   return json(409,{ok:true,paired:false,reason:'chat_already_linked'});
  }
  await rest('telegram_connections?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{user_id:row.user_id,chat_id:chatId,username:message.from?.username||null,connected_at:new Date().toISOString(),updated_at:new Date().toISOString()}});
  const next={...(row.preferences||{})};delete next.telegram_pair_code;delete next.telegram_pair_expires_at;
  await rest(`user_preferences?user_id=eq.${encodeURIComponent(row.user_id)}`,{method:'PATCH',prefer:'return=minimal',body:{preferences:next,updated_at:new Date().toISOString()}});
  await telegramSend(token,chatId,'Votre compte AUREVIA COPILOT est maintenant associé. Vous recevrez uniquement vos propres notifications.');
  return json(200,{ok:true,paired:true});
 }catch(error){console.error('[telegram-webhook] Request failed:',error?.message||'unknown error');return json(500,{error:'Telegram webhook processing failed.'});}
}
