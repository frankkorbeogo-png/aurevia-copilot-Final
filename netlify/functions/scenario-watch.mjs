import {randomBytes} from 'node:crypto';
import {getMarketInstrument} from '../../market-catalog.js';
import {getMarketStatus} from '../../market-hours.js';
import {calculateIndicators} from '../../indicators.js';
import {detectMarketStructure} from '../../structure.js';
import {runAureviaM5Confirmation} from './ai-collaboration.mjs';
// Scheduled monitor for manually saved AUREVIA scenarios. No broker access or order execution.
const BASE=()=>process.env.SUPABASE_URL,KEY=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(path,{method='GET',body,prefer}={}){const r=await fetch(`${BASE()}/rest/v1/${path}`,{method,headers:{apikey:KEY(),authorization:`Bearer ${KEY()}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,180)}`);return t?JSON.parse(t):null;}
async function candles(instrument,interval='15min',outputsize='4'){
 const market=getMarketInstrument(instrument);if(!market)throw new Error('Instrument non pris en charge par le catalogue AUREVIA.');
 const u=new URL('https://api.twelvedata.com/time_series');u.searchParams.set('symbol',market.provider);u.searchParams.set('interval',interval);u.searchParams.set('outputsize',outputsize);u.searchParams.set('timezone','UTC');u.searchParams.set('apikey',process.env.TWELVEDATA_API_KEY||'');
 const r=await fetch(u,{signal:AbortSignal.timeout(10000)}),d=await r.json();
 if(!r.ok||d.status==='error'||!Array.isArray(d.values)||d.values.length<3)throw new Error(d.message||`Bougies ${interval} indisponibles`);
 const rows=d.values.map(x=>({time:Date.parse(String(x.datetime).replace(' ','T')+'Z'),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
 if(rows.length<3)throw new Error(`Historique ${interval} invalide`);
 return rows;
}
async function livePrice(instrument){const market=getMarketInstrument(instrument);if(!market)throw new Error('Instrument non pris en charge par le catalogue AUREVIA.');const u=new URL('https://api.twelvedata.com/time_series');u.searchParams.set('symbol',market.provider);u.searchParams.set('interval','1min');u.searchParams.set('outputsize','1');u.searchParams.set('timezone','UTC');u.searchParams.set('apikey',process.env.TWELVEDATA_API_KEY||'');u.searchParams.set('format','JSON');const r=await fetch(u,{signal:AbortSignal.timeout(10000)});const d=await r.json();const candle=d.values?.[0],price=Number(candle?.close),quoteAt=candle?.datetime?Date.parse(candle.datetime.replace(' ','T')+'Z'):NaN,age=Date.now()-quoteAt;if(!r.ok||d.status==='error'||!Number.isFinite(price)||price<=0||!Number.isFinite(age)||age<0||age>90000)throw new Error(d.message||'Dernière bougie 1 minute absente ou trop ancienne.');return {price,quoteAt:new Date(quoteAt).toISOString()};}
async function notify(userId,message,reply_markup=null){const cs=await rest(`telegram_connections?select=chat_id,notify_validated_signals&user_id=eq.${encodeURIComponent(userId)}`);const c=cs?.[0];if(!c?.chat_id||!c.notify_validated_signals||!process.env.TELEGRAM_BOT_TOKEN)return false;const r=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:c.chat_id,text:message,disable_web_page_preview:true,...(reply_markup?{reply_markup}:{})})});const d=await r.json().catch(()=>null);return Boolean(r.ok&&d?.ok);}
export async function handler(){
 if(!BASE()||!KEY()||!process.env.TWELVEDATA_API_KEY)return {statusCode:503,body:'Monitor not configured'};
 try{
  const rows=await rest('aurevia_analysis_scenarios?select=*&status=in.(monitoring,zone_reached,entry_confirmed)&limit=100');
  let checked=0,zones=0,entries=0,invalidated=0,errors=0;const m15Cache=new Map(),m5Cache=new Map();
  for(const s of rows||[]){
   try{
    const market=getMarketInstrument(s.instrument);if(!market){errors++;continue;}
    const marketStatus=getMarketStatus(market.label);if(!marketStatus.tradable)continue;
    let bars=m15Cache.get(s.instrument);if(!bars){bars=await candles(s.instrument,'15min','4');m15Cache.set(s.instrument,bars);}
    const lastClosed=bars.filter(x=>x.time+15*60000<=Date.now()).at(-1);
    if(!lastClosed||Date.now()-(lastClosed.time+15*60000)>35*60*1000)throw new Error('Bougie M15 clôturée trop ancienne : surveillance suspendue.');
    const quote=await livePrice(s.instrument),price=quote.price;checked++;
    await rest(`aurevia_analysis_scenarios?id=eq.${s.id}`,{method:'PATCH',body:{last_price:price,last_price_at:quote.quoteAt,updated_at:new Date().toISOString()},prefer:'return=minimal'});
    if(s.trade_group_id)continue;
    const invalid=s.direction==='BUY'?price<=Number(s.stop_loss):price>=Number(s.stop_loss);
    if(invalid){
     await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=in.(monitoring,zone_reached,entry_confirmed)`,{method:'PATCH',body:{status:'invalidated',lot_confirmation_code:null,lot_confirmation_expires_at:null,stop_reason:'Niveau d’invalidation / stop-loss atteint',updated_at:new Date().toISOString()},prefer:'return=minimal'});
     await notify(s.user_id,`AUREVIA COPILOT · SCÉNARIO INVALIDÉ\n${s.instrument} · ${s.direction}\nPrix observé : ${price}\nNiveau d’invalidation atteint. Surveillance arrêtée.`);invalidated++;continue;
    }
    if(s.status==='entry_confirmed'){
     if(!s.lot_confirmation_code||!s.lot_confirmation_expires_at||Date.parse(s.lot_confirmation_expires_at)<=Date.now()){
      await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.entry_confirmed`,{method:'PATCH',body:{status:'stopped',lot_confirmation_code:null,lot_confirmation_expires_at:null,stop_reason:'Délai de validation du lot expiré',updated_at:new Date().toISOString()},prefer:'return=minimal'});continue;
     }
     if(s.entry_notified)continue;
     const sent=await notify(s.user_id,`AUREVIA COPILOT · VALIDATION M5 · ENTRÉE PROPOSÉE\n${s.instrument} · ${s.direction}\nPrix observé : ${price}\nPrix proposé par les IA M5 : ${s.entry_confirmation_price??s.entry}\nSL : ${s.stop_loss}\nTP : ${(s.take_profits||[]).join(' / ')}\n\nConsensus des trois IA obtenu après mitigation. Score M5 : ${s.entry_confirmation_score??'—'}/100. ${s.m5_ai_reason||''} Pour enregistrer le trade, choisissez le mode ci-dessous. Aucune opération broker n’est exécutée. Code valable jusqu’à ${new Date(s.lot_confirmation_expires_at).toLocaleTimeString('fr-FR',{timeZone:'UTC'})} UTC.`,{inline_keyboard:[[{text:'Position unique',callback_data:`start:${s.lot_confirmation_code}:unique`}],[{text:'Trades séparés',callback_data:`start:${s.lot_confirmation_code}:separate`}]]});
     if(sent)await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.entry_confirmed`,{method:'PATCH',body:{entry_notified:true,updated_at:new Date().toISOString()},prefer:'return=minimal'});
     continue;
    }
    const inZone=price>=Number(s.entry_low)&&price<=Number(s.entry_high);
    if(s.status==='monitoring'&&inZone&&!s.zone_notified){
     const changed=await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.monitoring`,{method:'PATCH',body:{status:'zone_reached',zone_reached_at:new Date().toISOString(),updated_at:new Date().toISOString()},prefer:'return=representation'});
     if(!changed?.length)continue;
     const stillActive=await rest(`aurevia_analysis_scenarios?select=id,status&id=eq.${s.id}&status=eq.zone_reached`);if(!stillActive?.length)continue;
     const sent=await notify(s.user_id,`AUREVIA COPILOT · ZONE ATTEINTE\n${s.instrument} · ${s.direction}\nPrix observé : ${price}\nZone : ${s.entry_low} – ${s.entry_high}\nLa zone est mitigée. Le suivi continue et l’analyse de confirmation M5 est maintenant activée. Aucune entrée n’est encore confirmée.`);
     if(sent)await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.zone_reached`,{method:'PATCH',body:{zone_notified:true,updated_at:new Date().toISOString()},prefer:'return=minimal'});
     zones++;continue;
    }
    if(s.status==='zone_reached'&&!s.entry_notified){
     let m5=m5Cache.get(s.instrument);if(!m5){m5=await candles(s.instrument,'5min','80');m5Cache.set(s.instrument,m5);}
     const closedM5=m5.filter(x=>x.time+5*60000<=Date.now());
     const lastClosedM5=closedM5.at(-1);
     if(!lastClosedM5||lastClosedM5.time<Date.parse(s.zone_reached_at||'')||Date.now()-(lastClosedM5.time+5*60000)>10*60000)continue;
     const lastAnalysisAt=Date.parse(s.last_m5_analysis_at||'');
     const closedAt=lastClosedM5.time+5*60000;
     if(Number.isFinite(lastAnalysisAt)&&closedAt<=lastAnalysisAt)continue;
     const confirmation=await runAureviaM5Confirmation({
      scenario:{instrument:s.instrument,direction:s.direction,entryZoneLow:Number(s.entry_low),entryZoneHigh:Number(s.entry_high),stopLoss:Number(s.stop_loss),takeProfits:s.take_profits||[]},
      candles:closedM5,
      indicators:calculateIndicators(closedM5),
      structure:detectMarketStructure(closedM5.slice(0,-1))
     });
     const proposalPatch={last_m5_analysis_at:new Date(closedAt).toISOString(),entry_confirmation_score:confirmation.score,entry_confirmation_components:confirmation.components||[],m5_ai_reason:confirmation.reason,m5_ai_proposal:{proposal:confirmation.proposal||null,review:confirmation.review||null,audit:confirmation.audit||null,priceAgreement:confirmation.priceAgreement??false,priceTolerance:confirmation.priceTolerance??null},updated_at:new Date().toISOString()};
     if(!confirmation.confirmed||!Number.isFinite(Number(confirmation.entryReference))){
      await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.zone_reached`,{method:'PATCH',body:proposalPatch,prefer:'return=minimal'});
      continue;
     }
     const m5Entry=Number(confirmation.entryReference),firstTarget=Number(s.take_profits?.[0]);
     const validM5Entry=Number.isFinite(m5Entry)&&Number.isFinite(firstTarget)&&m5Entry>=Number(s.entry_low)&&m5Entry<=Number(s.entry_high)&&(s.direction==='BUY'?m5Entry>Number(s.stop_loss)&&m5Entry<firstTarget:m5Entry<Number(s.stop_loss)&&m5Entry>firstTarget);
     if(!validM5Entry){
      await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.zone_reached`,{method:'PATCH',body:{...proposalPatch,m5_ai_reason:'Prix proposé hors de la zone M15 ou incohérent avec le SL/TP1 : entrée refusée.'},prefer:'return=minimal'});
      await notify(s.user_id,`AUREVIA COPILOT · ENTRÉE M5 REFUSÉE\n${s.instrument} · ${s.direction}\nLes IA ont proposé un prix qui ne respecte pas la zone M15 ou les niveaux SL/TP1. Aucune entrée n’est confirmée. Nouvelle analyse à la prochaine clôture M5.`);
      continue;
     }
     const stillActive=await rest(`aurevia_analysis_scenarios?select=id,status&id=eq.${s.id}&status=eq.zone_reached`);if(!stillActive?.length)continue;
     const code=randomBytes(4).toString('hex').toUpperCase(),expiresAt=new Date(Date.now()+30*60*1000).toISOString();
     const changed=await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.zone_reached`,{method:'PATCH',body:{...proposalPatch,status:'entry_confirmed',entry:m5Entry,trigger_price:trigger,limit_price:limit,entry_confirmation_price:m5Entry,entry_notified:false,entry_confirmed_at:new Date().toISOString(),lot_confirmation_code:code,lot_confirmation_expires_at:expiresAt,updated_at:new Date().toISOString()},prefer:'return=representation'});
     if(!changed?.length)continue;
     const sent=await notify(s.user_id,`AUREVIA COPILOT · VALIDATION M5 · ENTRÉE PROPOSÉE\n${s.instrument} · ${s.direction}\nPrix observé : ${price}\nPrix d’entrée proposé par les IA M5 : ${m5Entry}\nType d’ordre : ${orderType}\nSL : ${s.stop_loss}\nTP : ${(s.take_profits||[]).join(' / ')}\n\nJUSTIFICATION M5\nScore de confirmation : ${confirmation.score}/100\n${confirmation.reason}\n\nL’entrée est proposée pour validation manuelle et enregistrement. Aucune opération broker n’est exécutée. Code valable 30 minutes.`,{inline_keyboard:[[{text:'Position unique',callback_data:`start:${code}:unique`}],[{text:'Trades séparés',callback_data:`start:${code}:separate`}]]});
     if(sent){await rest(`aurevia_analysis_scenarios?id=eq.${s.id}&status=eq.entry_confirmed`,{method:'PATCH',body:{entry_notified:true,updated_at:new Date().toISOString()},prefer:'return=minimal'});entries++;}
    }
   }catch(e){errors++;console.error('[AUREVIA scenario-watch]',s?.id,e?.message||e);}
  }
  return {statusCode:200,headers:{'content-type':'application/json'},body:JSON.stringify({ok:true,checked,zones,entries,invalidated,errors})};
 }catch(e){return {statusCode:500,body:e.message};}
}
export const config={schedule:'* * * * *'};
