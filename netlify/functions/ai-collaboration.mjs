import { configuredAIProviders } from './_ai-provider.mjs';

const clean=(v,n=900)=>String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,n);
const parseJson=s=>JSON.parse(String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
async function ask(provider,messages,timeoutMs=10000){
 const body={model:provider.model,messages,temperature:0.2,stream:false};
 if(provider.id==='groq'){body.max_completion_tokens=1400;if(provider.model.startsWith('openai/gpt-oss-')){body.reasoning_effort='low';body.include_reasoning=false;body.response_format={type:'json_object'};}}
 else body.max_tokens=1400;
 const headers={authorization:'Bearer '+provider.key,'content-type':'application/json'};
 if(provider.id==='openrouter'){headers['HTTP-Referer']='https://aurevia-copilot-ia.netlify.app';headers['X-Title']='AUREVIA COPILOT';}
 const response=await fetch(provider.url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(provider.name+' HTTP '+response.status);
 const content=payload?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||!content.trim())throw new Error(provider.name+' réponse vide');
 return parseJson(content);
}
const system=role=>`Tu es ${role} du système collaboratif AUREVIA COPILOT. Réponds uniquement en JSON valide, en français. N'invente aucune donnée ni aucun prix. Les notes sur 100 sont qualitatives, jamais des probabilités.`;
export async function runAureviaCollaboration({messages}){
 const providers=configuredAIProviders(),byId=Object.fromEntries(providers.map(p=>[p.id,p]));
 const primary=byId.groq;
 if(!primary)throw new Error('Groq (IA principale) n’est pas configurée côté serveur.');
 const started=Date.now(),main=await ask(primary,messages,11000);
 const primaryInfo={provider:primary.name,model:primary.model,latencyMs:Date.now()-started,ok:true};
 const raw=messages.find(m=>m.role==='user')?.content||'{}';let market={};try{market=JSON.parse(raw);}catch{}
 const reviewers=[];
 if(byId.openrouter){
  const t=Date.now();
  try{
   const review=await ask(byId.openrouter,[{role:'system',content:system('l’analyste contradicteur OpenRouter')+' Analyse indépendamment les données et la proposition Groq. Cherche erreurs, contradictions et invalidations. JSON: {verdict:"CONFIRME|NUANCE|CONTESTE",criticalBlockers:[],agreements:[],disagreements:[],alternativeDecision:"BUY|SELL|WAIT",reasoning:"",marketReadingScore:0-100,buyConfirmationScore:null,sellConfirmationScore:null}. Ne crée aucun niveau absent.'},{role:'user',content:JSON.stringify({marketData:market,groqAnalysis:main})}],12000);
   reviewers.push({role:'CONTRE_ANALYSE',provider:byId.openrouter.name,model:byId.openrouter.model,latencyMs:Date.now()-t,ok:true,...review});
  }catch(e){reviewers.push({role:'CONTRE_ANALYSE',provider:byId.openrouter.name,model:byId.openrouter.model,latencyMs:Date.now()-t,ok:false,error:clean(e.message,180)});}
 }
 if(byId.cloudflare){
  const t=Date.now();
  try{
   const audit=await ask(byId.cloudflare,[{role:'system',content:system('l’auditeur indépendant des risques Cloudflare')+' Contrôle risques, contradictions et données manquantes. JSON: {riskLevel:"LOW|MODERATE|HIGH|CRITICAL",veto:false,criticalBlockers:[],risks:[],missingData:[],reasoning:"",marketReadingScore:0-100}. veto=true uniquement si un défaut concret invalide le scénario.'},{role:'user',content:JSON.stringify({marketData:market,groqAnalysis:main,openrouterReview:reviewers.find(x=>x.role==='CONTRE_ANALYSE')||null})}],10000);
   reviewers.push({role:'CONTROLE_RISQUE',provider:byId.cloudflare.name,model:byId.cloudflare.model,latencyMs:Date.now()-t,ok:true,...audit});
  }catch(e){reviewers.push({role:'CONTROLE_RISQUE',provider:byId.cloudflare.name,model:byId.cloudflare.model,latencyMs:Date.now()-t,ok:false,error:clean(e.message,180)});}
 }
 const critic=reviewers.find(x=>x.role==='CONTRE_ANALYSE'&&x.ok),audit=reviewers.find(x=>x.role==='CONTROLE_RISQUE'&&x.ok);
 const blockers=[...(Array.isArray(critic?.criticalBlockers)?critic.criticalBlockers:[]),...(Array.isArray(audit?.criticalBlockers)?audit.criticalBlockers:[])].map(x=>clean(x,240)).filter(Boolean);
 let decision=['BUY','SELL','WAIT'].includes(String(main.decision||'').toUpperCase())?String(main.decision).toUpperCase():'WAIT';
 let reason='Décision Groq conservée après les contrôles disponibles.';
 if(audit?.veto||blockers.length){decision='WAIT';reason=audit?.veto?'Scénario suspendu : contrôle de risque Cloudflare avec veto.':'Scénario suspendu : un ou plusieurs points critiques ont été relevés.';}
 else if(critic?.verdict==='CONTESTE'&&critic?.alternativeDecision==='WAIT'){decision='WAIT';reason='OpenRouter conteste le scénario et recommande WAIT.';}
 return {data:{...main,decision,collaboration:{mode:'THREE_ROLE_REVIEW',primary:primaryInfo,reviewers,decisionBeforeReview:String(main.decision||'WAIT').toUpperCase(),decisionAfterReview:decision,synthesisReason:reason,criticalBlockers:blockers,marketReadingScore:Number.isFinite(Number(main.marketReadingScore))?Math.max(0,Math.min(100,Math.round(Number(main.marketReadingScore)))):null,marketReadingFactors:Array.isArray(main.marketReadingFactors)?main.marketReadingFactors.slice(0,8):[],buyConfirmationScore:main.buy?.confirmationScore??null,sellConfirmationScore:main.sell?.confirmationScore??null,disclaimer:'Les IA assistent l’analyse et ne garantissent aucun résultat. Une IA indisponible ne vaut pas validation.'}},provider:'AUREVIA · 3 IA',model:primary.model,attempts:reviewers.filter(x=>!x.ok)};
}
