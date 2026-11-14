import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
const base=()=>process.env.SUPABASE_URL, key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(path,{method='GET',body,prefer}={}){const r=await fetch(`${base()}/rest/v1/${path}`,{method,headers:{apikey:key(),authorization:`Bearer ${key()}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();if(!r.ok)throw new Error(`Base de données (${r.status}) : ${t.slice(0,240)}`);return t?JSON.parse(t):null;}
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Méthode non autorisée.'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON invalide.'});}
 let ctx;try{ctx=await verifyBearerUser(event);await assertActiveSession(ctx);}catch(e){return json(e.statusCode||401,{error:e.message||'Session invalide.'});}
 if(!base()||!key())return json(503,{error:'Base de données non configurée.'});
 try{
  const user=ctx.user.id, action=body.action;
  if(action==='list'){
   const rows=await rest(`aurevia_analysis_scenarios?select=*&user_id=eq.${user}&order=created_at.desc&limit=30`);
   return json(200,{scenarios:rows||[]});
  }
  if(action==='create_position'){
   const scenarioId=String(body.id||''),mode=String(body.mode||''),volume=Number(body.volume);
   if(!scenarioId||!['unique','separate'].includes(mode)||!Number.isFinite(volume)||volume<=0)return json(400,{error:'Scénario, mode et lot valides requis.'});
   const rows=await rest(`aurevia_analysis_scenarios?select=id,status,lot_confirmation_expires_at,trade_group_id,instrument,direction&user_id=eq.${user}&id=eq.${encodeURIComponent(scenarioId)}&limit=1`);
   const scenario=rows?.[0];
   if(!scenario)return json(404,{error:'Scénario introuvable.'});
   if(scenario.trade_group_id)return json(409,{error:'Cette proposition a déjà été enregistrée en position.'});
   if(scenario.status!=='entry_confirmed'||!scenario.lot_confirmation_expires_at||Date.parse(scenario.lot_confirmation_expires_at)<=Date.now())return json(409,{error:'L’entrée n’est pas encore confirmée par la surveillance M5 multi-timeframes ou le délai de validation a expiré.'});
   const created=await rest('rpc/aurevia_create_position_from_scenario',{method:'POST',body:{p_scenario_id:scenarioId,p_user_id:user,p_mode:mode,p_volume:volume}});
   const groupId=typeof created==='string'?created:created?.[0]?.aurevia_create_position_from_scenario||created?.aurevia_create_position_from_scenario;
   if(!groupId)throw new Error('La base n’a pas confirmé la création de la position.');
   return json(201,{group_id:groupId,instrument:scenario.instrument,direction:scenario.direction,message:'Position enregistrée. Suivi et journal AUREVIA activés.'});
  }
  const id=String(body.id||'');
  if(action==='stop'){
   if(!id)return json(400,{error:'Identifiant du scénario manquant.'});
   const rows=await rest(`aurevia_analysis_scenarios?id=eq.${encodeURIComponent(id)}&user_id=eq.${user}&status=in.(monitoring,zone_reached,entry_confirmed)`,{method:'PATCH',body:{status:'stopped',lot_confirmation_code:null,lot_confirmation_expires_at:null,stopped_at:new Date().toISOString(),stop_reason:'Arrêt manuel par l’utilisateur'},prefer:'return=representation'});
   if(!rows?.length)return json(409,{error:'Ce scénario n’est plus en surveillance.'});
   return json(200,{scenario:rows[0],message:'Surveillance arrêtée. Aucune position ouverte n’a été modifiée.'});
  }
  if(action==='save'){
   const {instrument,direction,entry_low,entry_high,entry,stop_loss,take_profits,summary,source='ai',order_type=null,estimated_win_rate=null,probability_status='NOT_PROVIDED',probability_rationale='',confirmation_score=null,reasoning='',timeframe_analysis={},registration_channel='telegram'}=body;
   if(typeof instrument!=='string'||!['BUY','SELL'].includes(direction)||![entry_low,entry_high,entry,stop_loss].every(v=>Number.isFinite(Number(v))&&Number(v)>0)||!Array.isArray(take_profits)||take_profits.length<1||take_profits.length>3||!take_profits.every(v=>Number.isFinite(Number(v))&&Number(v)>0)||typeof summary!=='string'||summary.trim().length<8||summary.length>12000||!['ai','synthesis'].includes(source)||!['aurevia','telegram'].includes(registration_channel)||(estimated_win_rate!==null&&(!Number.isFinite(Number(estimated_win_rate))||Number(estimated_win_rate)<5||Number(estimated_win_rate)>95))||(confirmation_score!==null&&(!Number.isInteger(Number(confirmation_score))||Number(confirmation_score)<0||Number(confirmation_score)>100)))return json(400,{error:'Scénario incomplet ou niveaux invalides.'});
   const invalidLevels=Number(entry_low)>Number(entry_high)||(direction==='BUY'&&(Number(stop_loss)>=Number(entry)||take_profits.some(v=>Number(v)<=Number(entry))) )||(direction==='SELL'&&(Number(stop_loss)<=Number(entry)||take_profits.some(v=>Number(v)>=Number(entry))));
   if(invalidLevels)return json(400,{error:'Les niveaux sont incohérents avec le sens du scénario.'});
   const snapshot=timeframe_analysis&&typeof timeframe_analysis==='object'&&!Array.isArray(timeframe_analysis)?timeframe_analysis:{};
   const safeSnapshot=JSON.stringify(snapshot).length<=12000?snapshot:{};
   const row={user_id:user,instrument,direction,entry_low:Number(entry_low),entry_high:Number(entry_high),entry:Number(entry),stop_loss:Number(stop_loss),take_profits:take_profits.map(Number),summary:summary.trim(),source,order_type,estimated_win_rate:estimated_win_rate===null?null:Number(estimated_win_rate),probability_status:String(probability_status).slice(0,40),probability_rationale:String(probability_rationale||'').slice(0,1200),confirmation_score:confirmation_score===null?null:Number(confirmation_score),reasoning:String(reasoning||'').slice(0,5000),timeframe_analysis:safeSnapshot,status:'monitoring',zone_notified:false,entry_notified:false};
   const saved=await rest('aurevia_analysis_scenarios',{method:'POST',body:row,prefer:'return=representation'});
   const scenario=saved?.[0];if(!scenario)return json(500,{error:'Scénario non enregistré.'});
   const con=registration_channel==='telegram'?await rest(`telegram_connections?select=chat_id,notify_validated_signals&user_id=eq.${user}`):[];
   const c=con?.[0];let telegram={sent:false,reason:'not_connected'};
   if(c?.chat_id&&c.notify_validated_signals&&process.env.TELEGRAM_BOT_TOKEN){
    const text=`AUREVIA COPILOT · SCÉNARIO ENREGISTRÉ\n${instrument} · ${direction}\nZone à surveiller : ${entry_low} – ${entry_high}\nEntrée indicative : ${entry}\nSL : ${stop_loss}\nTP : ${take_profits.join(' / ')}\nSurveillance activée après votre validation manuelle.`;
    const r=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:c.chat_id,text,disable_web_page_preview:true})});
    const d=await r.json().catch(()=>null);telegram={sent:Boolean(r.ok&&d?.ok),reason:r.ok&&d?.ok?null:'send_failed'};
   }else if(c?.chat_id)telegram={sent:false,reason:'notifications_disabled'};
   return json(201,{scenario,telegram,registration_channel});
  }
  return json(400,{error:'Action inconnue.'});
 }catch(e){return json(500,{error:'Opération sur le scénario impossible.',detail:e.message});}
}
