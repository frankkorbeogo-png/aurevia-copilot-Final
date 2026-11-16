import {verifyBearerUser,assertActiveSession} from './_session-auth.mjs';
import {getMarketInstrument} from '../../market-catalog.js';
import {getMarketStatus} from '../../market-hours.js';
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
   const contractSpec=body.contract_spec&&typeof body.contract_spec==='object'&&!Array.isArray(body.contract_spec)?{...body.contract_spec}:null;
   const minLot=Number(contractSpec?.minLot),lotStep=Number(contractSpec?.lotStep),maxLot=contractSpec?.maxLot===null||contractSpec?.maxLot===undefined||contractSpec?.maxLot===''?null:Number(contractSpec.maxLot);
   if(!scenarioId||!['unique','separate'].includes(mode)||!Number.isFinite(volume)||volume<=0||!contractSpec||!Number.isFinite(minLot)||minLot<=0||!Number.isFinite(lotStep)||lotStep<=0||(maxLot!==null&&(!Number.isFinite(maxLot)||maxLot<minLot))||volume<minLot||(maxLot!==null&&volume>maxLot)||Math.abs(volume/lotStep-Math.round(volume/lotStep))>1e-7)return json(400,{error:'Scénario, mode, volume et limites techniques du broker invalides.'});
   const preferenceRows=await rest(`user_preferences?select=preferences&user_id=eq.${user}&limit=1`);
   const accountCurrency=String(preferenceRows?.[0]?.preferences?.account_currency||'').trim().toUpperCase();
   if(!/^[A-Z]{3}$/.test(accountCurrency))return json(400,{error:'Définissez d’abord la devise de votre compte dans Paramètres.'});
   const brokerSnapshot={accountCurrency,leverage:contractSpec.leverage??null};
   contractSpec.accountCurrency=accountCurrency;
   const rows=await rest(`aurevia_analysis_scenarios?select=id,status,lot_confirmation_expires_at,trade_group_id,instrument,direction,last_price_at,order_type,entry_confirmation_price,entry,entry_low,entry_high,stop_loss,take_profits&user_id=eq.${user}&id=eq.${encodeURIComponent(scenarioId)}&limit=1`);
   const scenario=rows?.[0];
   if(!scenario)return json(404,{error:'Scénario introuvable.'});
   if(scenario.trade_group_id)return json(409,{error:'Cette proposition a déjà été enregistrée en position.'});
   const marketInstrument=getMarketInstrument(scenario.instrument);if(!marketInstrument)return json(409,{error:'Cet instrument n’est plus pris en charge par AUREVIA.'});
   const marketStatus=getMarketStatus(marketInstrument.label);if(!marketStatus.tradable)return json(409,{error:marketStatus.reason||'Marché fermé : validation suspendue.',code:'MARKET_CLOSED'});
   const quoteAt=Date.parse(scenario.last_price_at||''),quoteAge=Date.now()-quoteAt;if(!Number.isFinite(quoteAge)||quoteAge< -5000||quoteAge>120000)return json(409,{error:'La dernière cotation est trop ancienne. Attendez la prochaine mise à jour du suivi avant de valider.',code:'SCENARIO_PRICE_STALE'});
   if(scenario.status!=='entry_confirmed'||!scenario.lot_confirmation_expires_at||Date.parse(scenario.lot_confirmation_expires_at)<=Date.now())return json(409,{error:'L’entrée n’est pas encore validée par l’analyse M5 après mitigation, ou le délai de validation a expiré.'});
   const created=await rest('rpc/aurevia_create_position_from_scenario',{method:'POST',body:{p_scenario_id:scenarioId,p_user_id:user,p_mode:mode,p_volume:volume,p_contract_spec:contractSpec,p_broker_snapshot:brokerSnapshot,p_auto_journal:body.auto_journal!==false}});
   const groupId=typeof created==='string'?created:created?.[0]?.aurevia_create_position_from_scenario||created?.aurevia_create_position_from_scenario;
   if(!groupId)throw new Error('La base n’a pas confirmé la création de la position.');
   return json(201,{group_id:groupId,instrument:scenario.instrument,direction:scenario.direction,entry_price:scenario.entry_confirmation_price??scenario.entry,message:'Position enregistrée. Suivi et journal AUREVIA activés.'});
  }
  const id=String(body.id||'');
  if(action==='stop'){
   if(!id)return json(400,{error:'Identifiant du scénario manquant.'});
   const rows=await rest(`aurevia_analysis_scenarios?id=eq.${encodeURIComponent(id)}&user_id=eq.${user}&status=in.(monitoring,zone_reached,entry_confirmed)`,{method:'PATCH',body:{status:'stopped',lot_confirmation_code:null,lot_confirmation_expires_at:null,stopped_at:new Date().toISOString(),stop_reason:'Arrêt manuel par l’utilisateur'},prefer:'return=representation'});
   if(!rows?.length)return json(409,{error:'Ce scénario n’est plus en surveillance.'});
   return json(200,{scenario:rows[0],message:'Surveillance arrêtée. Aucune position ouverte n’a été modifiée.'});
  }
  if(action==='save'){
   const {instrument,direction,entry_low,entry_high,entry,stop_loss,take_profits,summary,source='ai',order_type=null,trigger_price=null,limit_price=null,scenario_score=null,scenario_score_components=[],estimated_win_rate=null,probability_status='NOT_PROVIDED',probability_rationale='',confirmation_score=null,reasoning='',registration_channel='telegram'}=body;
   const marketInstrument=getMarketInstrument(instrument);
   if(!marketInstrument)return json(400,{error:'Instrument non pris en charge : choisissez un marché disponible dans AUREVIA.'});
   const instrumentLabel=marketInstrument.label;
   if(typeof instrument!=='string'||!['BUY','SELL'].includes(direction)||![entry_low,entry_high,entry,stop_loss].every(v=>Number.isFinite(Number(v))&&Number(v)>0)||!Array.isArray(take_profits)||take_profits.length<1||take_profits.length>3||!take_profits.every(v=>Number.isFinite(Number(v))&&Number(v)>0)||typeof summary!=='string'||summary.trim().length<8||summary.length>12000||!['ai','synthesis'].includes(source)||!['aurevia','telegram'].includes(registration_channel)||(estimated_win_rate!==null&&(!Number.isFinite(Number(estimated_win_rate))||Number(estimated_win_rate)<5||Number(estimated_win_rate)>95))||(confirmation_score!==null&&(!Number.isInteger(Number(confirmation_score))||Number(confirmation_score)<0||Number(confirmation_score)>100))||(scenario_score!==null&&(!Number.isInteger(Number(scenario_score))||Number(scenario_score)<0||Number(scenario_score)>100))||!Array.isArray(scenario_score_components)||scenario_score_components.length>30||!([null,'BUY MARKET','SELL MARKET','BUY LIMIT','SELL LIMIT','BUY STOP','SELL STOP','BUY STOP LIMIT','SELL STOP LIMIT'].includes(order_type)))return json(400,{error:'Scénario incomplet ou niveaux invalides.'});
   const normalizedOrder=order_type|| (direction==='BUY'?'BUY MARKET':'SELL MARKET');
   if(!['BUY MARKET','SELL MARKET','BUY LIMIT','SELL LIMIT','BUY STOP','SELL STOP','BUY STOP LIMIT','SELL STOP LIMIT'].includes(normalizedOrder)||!normalizedOrder.startsWith(direction+' '))return json(400,{error:'Type d’ordre invalide ou incompatible avec la direction.'});
   const isMarket=normalizedOrder.endsWith('MARKET');
   const isStopLimit=normalizedOrder.endsWith('STOP LIMIT');
   const isStop=normalizedOrder.endsWith(' STOP');
   const isLimit=normalizedOrder.endsWith(' LIMIT');
   const trigger=trigger_price===null?null:Number(trigger_price),limit=limit_price===null?null:Number(limit_price);
   if(isMarket&&(trigger!==null||limit!==null))return json(400,{error:'Un ordre MARKET ne doit pas contenir de prix de déclenchement ou de limite.'});
   if(isLimit&&!isStopLimit&&(!Number.isFinite(limit)||limit<=0||trigger!==null))return json(400,{error:'Un ordre LIMIT exige uniquement un prix limite valide.'});
   if(isStop&&(!Number.isFinite(trigger)||trigger<=0||limit!==null))return json(400,{error:'Un ordre STOP exige uniquement un prix de déclenchement valide.'});
   if(isStopLimit&&(!Number.isFinite(trigger)||trigger<=0||!Number.isFinite(limit)||limit<=0))return json(400,{error:'Un ordre STOP LIMIT exige un prix de déclenchement et un prix limite valides.'});
   if(isStopLimit&&(direction==='BUY'?trigger<=limit:trigger>=limit))return json(400,{error:'Géométrie STOP LIMIT incompatible avec le sens de l’ordre.'});
   const orderEntry=isLimit?limit:isStop?trigger:Number(entry);
   if(!Number.isFinite(orderEntry)||orderEntry<=0||Number(entry)<Number(entry_low)||Number(entry)>Number(entry_high)||(isLimit||isStop||isStopLimit)&&Number(entry)!==orderEntry)
    return json(400,{error:'Le prix d’entrée doit correspondre au niveau d’ordre et rester dans la zone proposée.'});
   const invalidLevels=Number(entry_low)>Number(entry_high)||(direction==='BUY'&&(Number(stop_loss)>=orderEntry||take_profits.some(v=>Number(v)<=orderEntry)))||(direction==='SELL'&&(Number(stop_loss)<=orderEntry||take_profits.some(v=>Number(v)>=orderEntry)));
   if(invalidLevels)return json(400,{error:'Les niveaux SL/TP doivent être cohérents avec le prix effectif de l’ordre.'});
   const row={user_id:user,instrument:instrumentLabel,direction,entry_low:Number(entry_low),entry_high:Number(entry_high),entry:Number(entry),stop_loss:Number(stop_loss),take_profits:take_profits.map(Number),summary:summary.trim(),source,order_type,trigger_price:trigger_price===null?null:Number(trigger_price),limit_price:limit_price===null?null:Number(limit_price),scenario_score:scenario_score===null?null:Number(scenario_score),scenario_score_components,estimated_win_rate:estimated_win_rate===null?null:Number(estimated_win_rate),probability_status:String(probability_status).slice(0,40),probability_rationale:String(probability_rationale||'').slice(0,1200),confirmation_score:confirmation_score===null?null:Number(confirmation_score),reasoning:String(reasoning||'').slice(0,5000),status:'monitoring',zone_notified:false,entry_notified:false};
   const saved=await rest('aurevia_analysis_scenarios',{method:'POST',body:row,prefer:'return=representation'});
   const scenario=saved?.[0];if(!scenario)return json(500,{error:'Scénario non enregistré.'});
   const con=registration_channel==='telegram'?await rest(`telegram_connections?select=chat_id,notify_validated_signals&user_id=eq.${user}`):[];
   const c=con?.[0];let telegram={sent:false,reason:'not_connected'};
   if(c?.chat_id&&c.notify_validated_signals&&process.env.TELEGRAM_BOT_TOKEN){
    const text=`AUREVIA COPILOT · SCÉNARIO ENREGISTRÉ\n${instrumentLabel} · ${direction}\nZone à surveiller : ${entry_low} – ${entry_high}\nEntrée indicative : ${entry}\nSL : ${stop_loss}\nTP : ${take_profits.join(' / ')}\nSurveillance activée après votre validation manuelle.`;
    const r=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:c.chat_id,text,disable_web_page_preview:true})});
    const d=await r.json().catch(()=>null);telegram={sent:Boolean(r.ok&&d?.ok),reason:r.ok&&d?.ok?null:'send_failed'};
   }else if(c?.chat_id)telegram={sent:false,reason:'notifications_disabled'};
   return json(201,{scenario,telegram,registration_channel});
  }
  return json(400,{error:'Action inconnue.'});
 }catch(e){return json(500,{error:'Opération sur le scénario impossible.',detail:e.message});}
}
