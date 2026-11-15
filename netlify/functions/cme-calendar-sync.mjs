import crypto from 'node:crypto';

const SOURCE_URL='https://www.cmegroup.com/trading-hours.html';
const SOURCE_KEY='cme-globex-holiday-calendar';
const MAX_EXCERPT=60000;

function toText(html){
 return html
  .replace(/<script[\\s\\S]*?<\\/script>/gi,' ')
  .replace(/<style[\\s\\S]*?<\\/style>/gi,' ')
  .replace(/<\\/(?:td|th)>/gi,' | ').replace(/<\\/(?:tr|h[1-6]|p|li|section|div)>/gi,'\\n')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&ndash;|&#8211;/gi,'–')
  .replace(/&mdash;|&#8212;/gi,'—').replace(/&rsquo;|&#8217;/gi,'’')
  .replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"')
  .replace(/\\s+/g,' ').replace(/\\s*\\n\\s*/g,'\\n')
  .trim();
}
function extractCandidates(text){
 const headings=[...text.matchAll(/(20(?:2[6-9]|3[0-2]) CME Globex Trading Schedule)/g)];
 const candidates=[];
 for(let i=0;i<headings.length;i++){
  const start=headings[i].index;
  const end=headings[i+1]?.index ?? Math.min(text.length,start+16000);
  const section=text.slice(start,end);
  const year=Number(headings[i][1].slice(0,4));
  const pattern=/(New Year’s|New Year's|Dr\\. Martin Luther King, Jr\\.|Martin Luther King|Presidents Day|President’s Day|Good Friday|Memorial Day|Juneteenth|Independence Day|Labor Day|Thanksgiving|Christmas)\\s*\\|\\s*([A-Za-z0-9 ,–-]+?)\\s*\\|\\s*Holiday Schedule/gi;
  let match;
  while((match=pattern.exec(section))!==null){
   candidates.push({year,holiday:match[1].replace(/[’]/g,"'"),dateRange:match[2].trim(),source:'CME Globex'});
  }
 }
 return candidates;
}
export async function handler(event){
 if(event.httpMethod && event.httpMethod!=='GET')return {statusCode:405,body:'Method not allowed'};
 const base=(process.env.SUPABASE_URL||'').replace(/\\/$/,'');
 const service=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!base||!service)return {statusCode:503,body:JSON.stringify({ok:false,error:'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent.'})};
 try{
  const response=await fetch(SOURCE_URL,{headers:{accept:'text/html','user-agent':'AUREVIA-COPILOT-calendar-sync/1.0'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('CME répond HTTP '+response.status);
  const html=await response.text();
  if(!html.includes('CME Globex Trading Schedule'))throw new Error('Section officielle CME Globex introuvable; aucun remplacement effectué.');
  const text=toText(html);
  const candidates=extractCandidates(text);
  if(!candidates.length)throw new Error('Aucune ligne de calendrier exploitable détectée; aucun remplacement effectué.');
  const excerpt=text.slice(Math.max(0,text.indexOf('2026 CME Globex Trading Schedule')),0)||text.slice(0,MAX_EXCERPT);
  const contentHash=crypto.createHash('sha256').update(text).digest('hex');
  const payload={
   source_key:SOURCE_KEY,source_url:SOURCE_URL,fetched_at:new Date().toISOString(),
   content_hash:contentHash,source_excerpt:excerpt.slice(0,MAX_EXCERPT),
   holiday_candidates:candidates,parse_status:'review_required',
   note:'Import automatique CME réussi. Ces dates concernent le calendrier CME Globex et doivent être vérifiées par instrument; elles ne déclenchent aucune fermeture AUREVIA.'
  };
  const saved=await fetch(base+'/rest/v1/cme_calendar_sync?on_conflict=source_key',{
   method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json',prefer:'resolution=merge-duplicates,return=minimal'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
  });
  if(!saved.ok)throw new Error('Enregistrement Supabase impossible: HTTP '+saved.status+' '+(await saved.text()).slice(0,300));
  return {statusCode:200,headers:{'content-type':'application/json'},body:JSON.stringify({ok:true,source:SOURCE_URL,fetchedAt:payload.fetched_at,candidateCount:candidates.length,contentHash,automaticMarketClosuresApplied:false})};
 }catch(error){
  console.error('[AUREVIA CME calendar sync]',error.message);
  return {statusCode:502,headers:{'content-type':'application/json'},body:JSON.stringify({ok:false,error:error.message,automaticMarketClosuresApplied:false})};
 }
}
