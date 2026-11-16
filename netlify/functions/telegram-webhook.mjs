import { validateContractSpec } from '../../contract-engine.js';
import {getMarketInstrument} from '../../market-catalog.js';
import {getMarketStatus} from '../../market-hours.js';
import { inferQuoteCurrency, getFxSnapshot } from './_fx-rate.mjs';
const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
const now=()=>new Date().toISOString();
async function rest(path,{method='GET',body,prefer}={}){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error('Supabase service credentials unavailable.');
 const r=await fetch(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...(prefer?{prefer}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();if(!r.ok)throw new Error(`Supabase REST ${r.status}: ${text.slice(0,200)}`);return text?JSON.parse(text):null;
}
async function telegramCall(token,method,payload){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok!==true)throw new Error(`Telegram ${method} failed (HTTP ${r.status}).`);return d.result;}
const telegramSend=(token,chatId,text,reply_markup)=>telegramCall(token,'sendMessage',{chat_id:chatId,text,disable_web_page_preview:true,...(reply_markup?{reply_markup}:{})});
const keyboard=rows=>({inline_keyboard:rows});
async function getOwner(chatId){const owners=await rest(`telegram_connections?select=user_id&chat_id=eq.${encodeURIComponent(chatId)}&limit=2`);if(!owners?.length)return null;if(owners.length!==1)throw new Error('Association Telegram ambiguë.');return owners[0].user_id;}
async function getPreferences(userId){const rows=await rest(`user_preferences?select=preferences&user_id=eq.${encodeURIComponent(userId)}&limit=1`);return rows?.[0]?.preferences||{};}
async function saveSetup(userId,setup){const prefs=await getPreferences(userId);const next={...prefs};if(setup)next.telegram_trade_setup=setup;else delete next.telegram_trade_setup;await rest(`user_preferences?user_id=eq.${encodeURIComponent(userId)}`,{method:'PATCH',prefer:'return=minimal',body:{preferences:next,updated_at:now()}});}
async function getScenario(userId,code){const rows=await rest(`aurevia_analysis_scenarios?select=id,instrument,direction,entry,entry_confirmation_price,last_price,last_price_at,stop_loss,take_profits,lot_confirmation_expires_at,trade_group_id&user_id=eq.${encodeURIComponent(userId)}&lot_confirmation_code=eq.${encodeURIComponent(code)}&status=eq.entry_confirmed&limit=2`);if(rows?.length!==1)return null;const s=rows[0];if(s.trade_group_id||!s.lot_confirmation_expires_at||Date.parse(s.lot_confirmation_expires_at)<Date.now())return null;return s;}
const numberInput=value=>{const n=Number(String(value).trim().replace(',','.'));return Number.isFinite(n)?n:null;};
const ask=(token,chatId,text,buttons)=>telegramSend(token,chatId,text,buttons?keyboard(buttons):undefined);
async function beginSetup(token,chatId,userId,code,mode){
 const preferences=await getPreferences(userId);
 const accountCurrency=String(preferences.account_currency||'').trim().toUpperCase();
 if(!/^[A-Z]{3}$/.test(accountCurrency)){await telegramSend(token,chatId,'Avant d’enregistrer une position, renseigne une seule fois la devise de ton compte dans AUREVIA → Paramètres → Devise du compte. Reviens ensuite confirmer le scénario ici.');return;}
 const existing=preferences.telegram_trade_setup;
 if(existing&&existing.code!==code){await telegramSend(token,chatId,'Une autre configuration de trade est déjà en cours. Termine-la ou envoie /annuler avant d’en commencer une nouvelle.');return;}
 const scenario=await getScenario(userId,code);
 if(!scenario){await telegramSend(token,chatId,'Ce scénario n’est plus disponible ou son code a expiré. Relance la surveillance depuis AUREVIA.');return;}
 const savedSpecs=preferences.broker_specs?.[scenario.instrument]||preferences.broker_specs?.default||{};\n const setup={code,mode,step:'lot',volume:null,spec:{...savedSpecs,accountCurrency,leverage:savedSpecs.leverage??null,minLot:savedSpecs.minLot??0.01,lotStep:savedSpecs.lotStep??0.01,maxLot:savedSpecs.maxLot??null,feesPerLot:savedSpecs.feesPerLot??0},autoJournal:true,startedAt:now()};
 await saveSetup(userId,setup);
 await ask(token,chatId,`Très bien. Configurons ta position ${scenario.instrument} ${scenario.direction}.\n\nQuel volume souhaites-tu utiliser ?\nExemple : 0.05\n\nMode : ${mode==='unique'?'Position unique (lot total réparti entre les TP)':'Trades séparés (lot appliqué à chaque TP)'}`);
}

function nextPrompt(setup){
 const prompts={
  lot:'Quel volume souhaites-tu utiliser ? Exemple : 0.05.',
  leverage:'Quel est ton levier ? Exemple : 200 ou 2000. Tu peux répondre « ignorer » si tu ne souhaites pas le renseigner.',
  contractSize:'Quelle est la taille du contrat pour 1 lot sur cet instrument ? Exemple : 100 pour 100 oz. Ne devine pas cette valeur.',
  pointSize:'Quelle est la taille d’un point ?',
  pointValue:'Quelle est la valeur monétaire d’un point pour 1 lot, dans la devise de ton compte ?',
  tickSize:'Quelle est la taille d’un tick ?',
  tickValue:'Quelle est la valeur monétaire d’un tick pour 1 lot, dans la devise de ton compte ?',
  feesPerLot:'Quels sont les frais/commissions par lot dans la devise de ton compte ? Réponds 0 si aucun.',
  minLot:'Quel est le lot minimum autorisé par ton broker ? Réponds « ignorer » pour conserver 0,01.',
  lotStep:'Quel est le pas de volume autorisé ? Exemple : 0.001. Réponds « ignorer » pour conserver 0,01.',
  maxLot:'Quel est le lot maximum autorisé ? Réponds « ignorer » si aucun maximum ne s’applique.'
 };
 return prompts[setup.step]||'Réponse non reconnue. Envoie /annuler pour recommencer.';
}

async function promptStep(token,chatId,setup){
 if(setup.step==='calculationType'){
  await ask(token,chatId,'Comment est calculée la valeur de cet instrument ?',[[{text:'Taille du contrat',callback_data:`calc:${setup.code}:contract`}],[{text:'Valeur du point',callback_data:`calc:${setup.code}:point`}],[{text:'Valeur du tick',callback_data:`calc:${setup.code}:tick`}]]);
  return;
 }
 await telegramSend(token,chatId,nextPrompt(setup));
}

function summary(setup,scenario){
 const s=setup.spec,entry=scenario.entry_confirmation_price??scenario.entry??scenario.last_price??'Non renseignée';
 const tps=Array.isArray(scenario.take_profits)?scenario.take_profits.join(' · '):'Non renseignés';
 const calc=s.calculationType==='contract'
  ?`Taille du contrat : ${s.contractSize}\nDevise de cotation : ${s.quoteCurrency||'Non identifiée'}\nConversion vers ${s.accountCurrency} : ${s.quoteToAccount}`
  :s.calculationType==='point'
   ?`Taille du point : ${s.pointSize}\nValeur du point/lot : ${s.pointValue}`
   :`Taille du tick : ${s.tickSize}\nValeur du tick/lot : ${s.tickValue}`;
 return `Vérifie les informations avant enregistrement\n\nInstrument : ${scenario.instrument}\nDirection : ${scenario.direction}\nEntrée : ${entry}\nStop Loss : ${scenario.stop_loss??'Non renseigné'}\nTake Profits : ${tps}\nMode : ${setup.mode==='unique'?'Position unique':'Trades séparés'}\nLot : ${setup.volume}\nDevise du compte (profil) : ${s.accountCurrency}\nLevier : ${s.leverage?`1:${s.leverage}`:'Non précisé'}\nMéthode : ${s.calculationType}\n${calc}\nLot minimum et incrément : ${s.minLot} / ${s.lotStep}${s.maxLot!==null?` · maximum ${s.maxLot}`:''}\nFrais/lot : ${s.feesPerLot} ${s.accountCurrency}\nAjout automatique au journal : ${setup.autoJournal?'Oui':'Non'}\n\nConfirmer l’enregistrement ? Aucun ordre ne sera envoyé au broker.`;
}

async function finishSetup(token,chatId,userId,setup){
 const scenario=await getScenario(userId,setup.code);
 if(!scenario){await saveSetup(userId,null);await telegramSend(token,chatId,'Le scénario a expiré ou a déjà été enregistré.');return false;}
 const marketInstrument=getMarketInstrument(scenario.instrument);if(!marketInstrument){await telegramSend(token,chatId,'Cet instrument n’est plus pris en charge par AUREVIA. Aucun trade n’a été enregistré.');return false;}
 const marketStatus=getMarketStatus(marketInstrument.label);if(!marketStatus.tradable){await telegramSend(token,chatId,marketStatus.reason||'Marché fermé : validation suspendue. Aucun trade n’a été enregistré.');return false;}
 const quoteAt=Date.parse(scenario.last_price_at||''),quoteAge=Date.now()-quoteAt;if(!Number.isFinite(quoteAge)||quoteAge< -5000||quoteAge>120000){await telegramSend(token,chatId,'La dernière cotation est trop ancienne. Attends la prochaine mise à jour de surveillance puis confirme à nouveau.');return false;}
 const quoteCurrency=inferQuoteCurrency(scenario.instrument);
 if(setup.spec.calculationType==='contract'&&!quoteCurrency){await telegramSend(token,chatId,`La devise de cotation de ${scenario.instrument} n’est pas reconnue. La position n’a pas été enregistrée pour éviter un calcul financier incorrect.`);return false;}
 let fxSnapshot=null,quoteToAccount=1;
 if(quoteCurrency&&quoteCurrency!==setup.spec.accountCurrency){
  try{fxSnapshot=await getFxSnapshot(quoteCurrency,setup.spec.accountCurrency);quoteToAccount=fxSnapshot.rate;}
  catch(error){await telegramSend(token,chatId,`Conversion ${quoteCurrency} → ${setup.spec.accountCurrency} indisponible : ${error.message}. La position n’a pas été enregistrée.`);return false;}
 }
 setup.spec.quoteCurrency=quoteCurrency;setup.spec.quoteToAccount=quoteToAccount;setup.spec.fxSnapshot=fxSnapshot;
 const checked=validateContractSpec(setup.spec);
 if(!checked.ok){await telegramSend(token,chatId,`Paramètres incomplets : ${checked.error}`);return false;}
 const spec=checked.spec,volume=Number(setup.volume);
 if(!Number.isFinite(volume)||volume<spec.minLot||(spec.maxLot!==null&&volume>spec.maxLot)||Math.abs(volume/spec.lotStep-Math.round(volume/spec.lotStep))>1e-7){
  setup.step='lot';await saveSetup(userId,setup);
  await telegramSend(token,chatId,`Le lot doit respecter le minimum ${spec.minLot}, le pas ${spec.lotStep}${spec.maxLot!==null?` et le maximum ${spec.maxLot}`:''}. Saisis un autre volume.`);return false;
 }
 const brokerSnapshot={accountCurrency:spec.accountCurrency,leverage:spec.leverage};\n const preferences=await getPreferences(userId);const brokerSpecs={...(preferences.broker_specs||{}),[scenario.instrument]:{...spec}};await rest(`user_preferences?user_id=eq.${encodeURIComponent(userId)}`,{method:'PATCH',prefer:'return=minimal',body:{preferences:{...preferences,broker_specs:brokerSpecs},updated_at:now()}});
 const result=await rest('rpc/aurevia_create_position_from_scenario',{method:'POST',body:{p_scenario_id:scenario.id,p_user_id:userId,p_mode:setup.mode,p_volume:volume,p_contract_spec:spec,p_broker_snapshot:brokerSnapshot,p_auto_journal:setup.autoJournal!==false}});
 const groupId=typeof result==='string'?result:result?.[0]?.aurevia_create_position_from_scenario||result?.aurevia_create_position_from_scenario;
 if(!groupId)throw new Error('La base n’a pas confirmé la création de la position.');
 await saveSetup(userId,null);
 await telegramSend(token,chatId,`✅ POSITION ENREGISTRÉE\n${scenario.instrument} · ${scenario.direction}\nEntrée de référence M5 : ${scenario.entry_confirmation_price??scenario.entry??'—'} · SL : ${scenario.stop_loss??'—'}\nLot : ${volume}\nMéthode : ${spec.calculationType}\nDevise : ${spec.accountCurrency}\nJournal automatique : ${setup.autoJournal!==false?'activé':'désactivé'}\n\nLe suivi interne AUREVIA est activé. Aucun ordre n’a été envoyé au broker.`);
 return true;
}

async function handleCallback(token,callback){
 const data=String(callback.data||''),chatId=String(callback.message?.chat?.id||''),from=String(callback.from?.id||'');
 if(!chatId||chatId!==from||callback.message?.chat?.type!=='private')return;
 await telegramCall(token,'answerCallbackQuery',{callback_query_id:callback.id});
 const userId=await getOwner(chatId);
 if(!userId){await telegramSend(token,chatId,'Associe d’abord ton compte Telegram depuis AUREVIA COPILOT.');return;}
 let m=data.match(/^start:([A-F0-9]{8}):(unique|separate)$/i);
 if(m){await beginSetup(token,chatId,userId,m[1].toUpperCase(),m[2].toLowerCase());return;}
 m=data.match(/^calc:([A-F0-9]{8}):(contract|point|tick)$/i);
 if(m){
  const prefs=await getPreferences(userId),setup=prefs.telegram_trade_setup;
  if(!setup||setup.code!==m[1])return telegramSend(token,chatId,'Cette configuration n’est plus active.');
  setup.spec.calculationType=m[2];setup.step=m[2]==='contract'?'contractSize':m[2]==='point'?'pointSize':'tickSize';
  await saveSetup(userId,setup);await promptStep(token,chatId,setup);return;
 }
 m=data.match(/^edit:([A-F0-9]{8}):(lot|spec)$/i);
 if(m){
  const prefs=await getPreferences(userId),setup=prefs.telegram_trade_setup;
  if(!setup||setup.code!==m[1])return telegramSend(token,chatId,'Cette configuration n’est plus active.');
  setup.step=m[2]==='lot'?'lot':'leverage';await saveSetup(userId,setup);await promptStep(token,chatId,setup);return;
 }
 m=data.match(/^journal:([A-F0-9]{8}):(on|off)$/i);
 if(m){
  const prefs=await getPreferences(userId),setup=prefs.telegram_trade_setup;
  if(!setup||setup.code!==m[1])return telegramSend(token,chatId,'Cette configuration n’est plus active.');
  setup.autoJournal=m[2]==='on';await saveSetup(userId,setup);
  const scenario=await getScenario(userId,setup.code);if(scenario)await showReview(token,chatId,setup,scenario);return;
 }
 m=data.match(/^(confirm|cancel):([A-F0-9]{8})$/i);
 if(m){
  const prefs=await getPreferences(userId),setup=prefs.telegram_trade_setup;
  if(!setup||setup.code!==m[2])return telegramSend(token,chatId,'Cette configuration n’est plus active.');
  if(m[1]==='cancel'){await saveSetup(userId,null);await telegramSend(token,chatId,'Configuration annulée. Le scénario reste disponible tant que son code n’a pas expiré.');return;}
  await finishSetup(token,chatId,userId,setup);return;
 }
}

async function showReview(token,chatId,setup,scenario){
 await saveSetup((await getOwner(chatId)),setup);
 await ask(token,chatId,summary(setup,scenario),[
  [{text:'✅ Confirmer et enregistrer',callback_data:`confirm:${setup.code}`}],
  [{text:'Modifier le lot',callback_data:`edit:${setup.code}:lot`},{text:'Modifier les paramètres',callback_data:`edit:${setup.code}:spec`}],
  [{text:`${setup.autoJournal?'☑':'☐'} Ajouter au journal automatiquement`,callback_data:`journal:${setup.code}:${setup.autoJournal?'off':'on'}`}],
  [{text:'❌ Annuler',callback_data:`cancel:${setup.code}`}]
 ]);
}
async function handleGuidedMessage(token,chatId,userId,text){
 const prefs=await getPreferences(userId),setup=prefs.telegram_trade_setup;
 if(!setup)return false;
 if(Date.now()-Date.parse(setup.startedAt)>30*60*1000){await saveSetup(userId,null);await telegramSend(token,chatId,'Cette configuration a expiré. Attends une nouvelle confirmation d’entrée.');return true;}
 const value=text.trim(),skip=/^(ignorer|aucun|aucune)$/i.test(value),n=numberInput(value),step=setup.step;
 if(step==='lot'){
  if(n===null||n<=0){await telegramSend(token,chatId,'Saisis un volume positif. Exemple : 0.05.');return true;}
  setup.volume=n;setup.step=setup.spec.calculationType?'review':'leverage';
 }else if(step==='leverage'){
  if(!skip&&(n===null||n<1||n>100000)){await telegramSend(token,chatId,'Saisis un levier valide, par exemple 2000, ou « ignorer ».');return true;}
  setup.spec.leverage=skip?null:n;setup.step=setup.spec.calculationType?'review':'calculationType';
 }else if(['contractSize','pointSize','pointValue','tickSize','tickValue','feesPerLot','minLot','lotStep','maxLot'].includes(step)){
  if(['minLot','lotStep','maxLot'].includes(step)&&skip){
   if(step==='maxLot')setup.spec.maxLot=null;
  }else{
   if(n===null||(step==='feesPerLot'?n<0:n<=0)){await telegramSend(token,chatId,'Saisis une valeur numérique positive ou « ignorer » pour un paramètre de lot facultatif.');return true;}
   setup.spec[step]=n;
  }
  const order=setup.spec.calculationType==='contract'?['contractSize','feesPerLot','minLot','lotStep','maxLot']:setup.spec.calculationType==='point'?['pointSize','pointValue','feesPerLot','minLot','lotStep','maxLot']:['tickSize','tickValue','feesPerLot','minLot','lotStep','maxLot'];
  const index=order.indexOf(step);setup.step=order[index+1]||'review';
 }else return false;
 if(setup.step==='review'){
  const scenario=await getScenario(userId,setup.code);
  if(!scenario){await saveSetup(userId,null);await telegramSend(token,chatId,'Le scénario a expiré.');return true;}
  const checked=validateContractSpec({...setup.spec,quoteToAccount:1,quoteCurrency:inferQuoteCurrency(scenario.instrument)});
  if(!checked.ok){
   await telegramSend(token,chatId,`Il manque un paramètre : ${checked.error}`);
   const e=checked.error;setup.step=e.includes('taille du contrat')?'contractSize':e.includes('point')?'pointSize':e.includes('tick')?'tickSize':e.includes('lot minimum')?'contractSize':'contractSize';
   await saveSetup(userId,setup);await promptStep(token,chatId,setup);return true;
  }
  await showReview(token,chatId,setup,scenario);return true;
 }
 await saveSetup(userId,setup);await promptStep(token,chatId,setup);return true;
}

async function clearPendingCode(userId){const old=await getPreferences(userId),next={...old};delete next.telegram_pair_code;delete next.telegram_pair_expires_at;await rest(`user_preferences?user_id=eq.${encodeURIComponent(userId)}`,{method:'PATCH',prefer:'return=minimal',body:{preferences:next,updated_at:now()}});}
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'});const expected=process.env.TELEGRAM_WEBHOOK_SECRET,received=event.headers?.['x-telegram-bot-api-secret-token']||event.headers?.['X-Telegram-Bot-Api-Secret-Token'];if(!expected||received!==expected)return json(401,{error:'Unauthorized webhook.'});let update;try{update=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid JSON.'});}const message=update.message;if(!update.callback_query&&(!message?.text||!message.chat?.id||message.chat.type!=='private'||message.from?.is_bot||String(message.from?.id)!==String(message.chat.id)))return json(200,{ok:true,ignored:true});const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return json(503,{error:'Telegram bot not configured.'});
 try{
  if(update.callback_query){await handleCallback(token,update.callback_query);return json(200,{ok:true,callback:true});}
  if(!message?.text)return json(200,{ok:true,ignored:true});
  const command=message.text.trim(),chatId=String(message.chat.id);
  if(/^\/(help|aide)(?:@[\w]+)?(?:\s|$)/i.test(command)||/^\/start(?:@[\w]+)?$/i.test(command)){const userId=await getOwner(chatId);await telegramSend(token,chatId,userId?'Bienvenue dans AUREVIA COPILOT. Tu recevras ici tes alertes privées. Lorsqu’une entrée sera confirmée, utilise les boutons pour configurer ton trade, sans commande technique.\n\n/aide : afficher cette aide.\n/annuler : annuler une saisie en cours.':'Bienvenue. Pour commencer, associe ton compte Telegram depuis les paramètres Telegram d’AUREVIA COPILOT.');return json(200,{ok:true,help:true});}
  if(/^\/(annuler|cancel)(?:@[\w]+)?(?:\s|$)/i.test(command)){const userId=await getOwner(chatId);if(userId)await saveSetup(userId,null);await telegramSend(token,chatId,'La saisie en cours a été annulée.');return json(200,{ok:true,cancelled:true});}
  if(/^\/(lot|spec)(?:@[\w]+)?(?:\s|$)/i.test(command)){await telegramSend(token,chatId,'Les commandes techniques /lot et /spec ne sont plus nécessaires. Utilise les boutons affichés après la confirmation d’entrée.');return json(200,{ok:true,legacy_help:true});}
  if(/^\/(stop|disconnect|deconnecter)(?:@[\w]+)?(?:\s|$)/i.test(command)){const userId=await getOwner(chatId);if(!userId){await telegramSend(token,chatId,'Aucun compte AUREVIA n’est associé à cette conversation.');return json(200,{ok:true,unlinked:false});}await rest(`telegram_connections?chat_id=eq.${encodeURIComponent(chatId)}`,{method:'DELETE',prefer:'return=minimal'});await saveSetup(userId,null);await clearPendingCode(userId);await telegramSend(token,chatId,'🔕 Notifications AUREVIA arrêtées. Pour les réactiver, retourne dans AUREVIA et génère un nouveau code de liaison.');return json(200,{ok:true,unlinked:true});}
  const userId=await getOwner(chatId);if(userId&&await handleGuidedMessage(token,chatId,userId,command))return json(200,{ok:true,guided:true});
  const pairMatch=command.match(/^\/start(?:@[\w]+)?\s+([A-F0-9]{8})$/i);if(pairMatch){const code=pairMatch[1].toUpperCase();const prefs=await rest(`user_preferences?select=user_id,preferences&preferences->>telegram_pair_code=eq.${encodeURIComponent(code)}&limit=2`);if(prefs.length!==1){await telegramSend(token,chatId,'Code de liaison inconnu ou expiré. Générez un nouveau code depuis AUREVIA.');return json(200,{ok:true,paired:false});}const row=prefs[0],expires=row.preferences?.telegram_pair_expires_at?Date.parse(row.preferences.telegram_pair_expires_at):0;if(!expires||expires<Date.now()){await telegramSend(token,chatId,'Ce code de liaison a expiré. Générez-en un nouveau depuis AUREVIA.');return json(200,{ok:true,paired:false});}const owners=await rest(`telegram_connections?select=user_id&chat_id=eq.${encodeURIComponent(chatId)}&limit=2`);if(owners.some(x=>x.user_id!==row.user_id)){await telegramSend(token,chatId,'⛔ Ce compte Telegram est déjà lié à un autre compte AUREVIA. Pour le transférer, connecte-toi au premier compte AUREVIA et déconnecte Telegram dans ses paramètres, puis recommence la liaison.');return json(200,{ok:true,paired:false,reason:'telegram_already_linked'});}const accountLinks=await rest(`telegram_connections?select=chat_id&user_id=eq.${encodeURIComponent(row.user_id)}&limit=2`);if(accountLinks.some(x=>x.chat_id&&String(x.chat_id)!==chatId)){await telegramSend(token,chatId,'⛔ Ce compte AUREVIA possède déjà un autre compte Telegram associé. Déconnecte d’abord l’ancien Telegram depuis les paramètres de ce compte AUREVIA, puis recommence.');return json(200,{ok:true,paired:false,reason:'aurevia_already_linked'});}try{await rest('telegram_connections?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{user_id:row.user_id,chat_id:chatId,username:message.from?.username||null,connected_at:now(),updated_at:now()}});}catch(linkError){if(/409|23505|duplicate key|unique constraint/i.test(String(linkError?.message||''))){await telegramSend(token,chatId,'⛔ Cette liaison vient d’être prise par une autre connexion. Un compte Telegram ne peut être lié qu’à un seul compte AUREVIA. Déconnecte l’ancienne liaison avant de réessayer.');return json(200,{ok:true,paired:false,reason:'unique_link_conflict'});}throw linkError;}await clearPendingCode(row.user_id);await telegramSend(token,chatId,'✅ Ton compte AUREVIA COPILOT est maintenant associé. Tu recevras uniquement tes notifications privées.');return json(200,{ok:true,paired:true});}
  await telegramSend(token,chatId,'Je n’ai pas compris. Envoie /aide pour connaître les commandes disponibles.');return json(200,{ok:true,ignored:true});
 }catch(error){console.error('[telegram-webhook] Request failed:',error?.message||'unknown error');return json(500,{error:'Telegram webhook processing failed.'});}
}
