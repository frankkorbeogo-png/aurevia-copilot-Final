import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=process.env.TELEGRAM_BOT_TOKEN;
 if(!base||!key||!token)return json(503,{error:'Notification service not configured.'});
 let payload;try{payload=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid JSON.'});}
 const {type='analysis',text}=payload;if(!['analysis','signal','economic','test','trade_open','trade_tp','trade_sl','trade_close'].includes(type)||typeof text!=='string'||!text.trim()||text.length>3500)return json(400,{error:'Invalid notification payload.'});
 let userId=null;
 const internalSecret=process.env.INTERNAL_NOTIFY_SECRET;
 if(internalSecret&&event.headers?.authorization===`Bearer ${internalSecret}`){userId=typeof payload.user_id==='string'?payload.user_id:null;}
 else {
  let context;try{context=await verifyBearerUser(event);await assertActiveSession(context);}catch(error){return json(error.statusCode||401,{error:error.message||'Invalid user session.',code:error.code||null});}
  userId=context.user.id;
 }
 if(!userId)return json(401,{error:'Authenticated user is missing.'});
 const r=await fetch(`${base}/rest/v1/telegram_connections?select=chat_id,notify_all_analyses,notify_validated_signals,notify_economic_announcements&user_id=eq.${encodeURIComponent(userId)}`,{headers:{apikey:key,authorization:`Bearer ${key}`}});
 if(!r.ok)return json(502,{error:'Unable to read Telegram connection.'});
 const rows=await r.json(),row=rows[0];if(!row?.chat_id)return json(404,{error:'No Telegram connection.'});
 const ownersResponse=await fetch(`${base}/rest/v1/telegram_connections?select=user_id&chat_id=eq.${encodeURIComponent(row.chat_id)}`,{headers:{apikey:key,authorization:`Bearer ${key}`}});if(!ownersResponse.ok)return json(502,{error:'Unable to verify Telegram chat ownership.'});const owners=await ownersResponse.json();if(owners.length!==1||owners[0].user_id!==userId)return json(409,{error:'Telegram chat ownership is ambiguous; notification blocked.'});
 const allowed=type==='test'?true:type==='signal'?Boolean(row.notify_all_analyses||row.notify_validated_signals):['trade_open','trade_tp','trade_sl','trade_close'].includes(type)?Boolean(row.notify_validated_signals):type==='economic'?Boolean(row.notify_economic_announcements):Boolean(row.notify_all_analyses);
 if(!allowed)return json(200,{sent:false,reason:'disabled_by_user'});
 const sent=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:row.chat_id,text,disable_web_page_preview:true})});
 const telegramResult=await sent.json().catch(()=>null);if(!sent.ok||!telegramResult?.ok)return json(502,{error:'Telegram a refusé la notification.',telegram_error_code:telegramResult?.error_code||null});return json(200,{sent:true,telegram_message_id:telegramResult.result?.message_id||null});
}
