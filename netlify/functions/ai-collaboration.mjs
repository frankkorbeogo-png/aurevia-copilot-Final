import { configuredAIProviders } from './_ai-provider.mjs';

const clean=(v,n=900)=>String(v??'').replace(/[\r\n\t]+/g,' ').slice(0,n);
const parseJson=s=>JSON.parse(String(s||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,''));
async function ask(provider,messages,timeoutMs=12000){
 const body={model:provider.model,messages,temperature:0.2,stream:false};
 if(provider.id==='groq'){body.max_completion_tokens=1600;if(provider.model.startsWith('openai/gpt-oss-')){body.reasoning_effort='low';body.include_reasoning=false;body.response_format={type:'json_object'};}}
 else body.max_tokens=1600;
 const response=await fetch(provider.url,{method:'POST',headers:{authorization:'Bearer '+provider.key,'content-type':'application/json',...(provider.id==='openrouter'?{'HTTP-Referer':'https://aurevia-copilot-ia.netlify.app','X-Title':'AUREVIA COPILOT'}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(provider.name+' HTTP '+response.status);
 const content=payload?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||!content.trim())throw new Error(provider.name+' réponse vide');
 return parseJson(content);
}
const system=(role)=>`Tu es ${role} du système collaboratif AUREVIA COPILOT. Réponds uniquement en JSON valide, en français. Ne fabrique aucune donnée ni aucun prix. Les notes 0-100 sont qualitatives, jamais des probabilités.`;
export async function runAureviaCollaboration({messages,max_tokens=1800}){
 const providers=configuredAIProviders();
 const byId=Object.fromEntries(providers.map(p=>[p.id,p]));
 const primary=byId.groq||providers[0];
 if(!primary)throw new Error('Aucun fournisseur IA configuré côté serveur.');
 const primaryStarted=Date.now();
 const main=await ask(primary,messages,9000);
 const primaryInfo={provider:primary.name,model:primary.model,latencyMs:Date.now()-primaryStarted,ok:true};
 const userPayload=messages.find(m=>m.role==='user')?.content||'{}';
 let market={};try{market=JSON.parse(userPayload);}catch{}
 const reviewers=[];
 const openrouter=byId.openrouter;
 if(openrouter){
  const started=Date.now();
  try{
   const critique=await ask(openrouter,[{role:'system',content:system('l’analyste contradicteur OpenRouter')+' Examine les données de marché et la proposition Groq indépendamment. Cherche les erreurs, éléments contraires et invalidations. JSON: {verdict:"CONFIRME|NUANCE|CONTESTE",criticalBlockers:[],agreements:[],disagreements:[],alternativeDecision:"BUY|SELL|WAIT",reasoning:"",marketReadingScore:0-100,buyConfirmationScore:null|number,sellConfirmationScore:null|number}. Ne crée aucun niveau absent des données.'},{role:'user',content:JSON.stringify({marketData:market,groqAnalysis:main})}],12000);
   reviewers.push({role:'CONTRE_ANALYSE',provider:openrouter.name,model:openrouter.model,latencyMs:Date.now()-started,ok:true,...critique});
  }catch(e){reviewers.push({role:'CONTRE_ANALYSE',provider:openrouter.name,model:openrouter.model,latencyMs:Date.now()-started,ok:false,error:clean(e.message,180)});}
 }
 const cloudflare=byId.cloudflare;
 if(cloudflare){
  const started=Date.now();
  try{
   const audit=await ask(cloudflare,[{role:'system',content:system('l’auditeur des risques Cloudflare')+' Contrôle les risques, contradictions et données manquantes après lecture indépendante. Ne répète pas l’analyse Groq. JSON: {riskLevel:"LOW|MODERATE|HIGH|CRITICAL",veto:false,criticalBlockers:[],risks:[],missingData:[],reasoning:"",marketReadingScore:0-100}. veto=true uniquement si un défaut concret invalide le scénario directionnel.'},{role:'user',content:JSON.stringify({marketData:market,groqAnalysis:main,openrouterReview:reviewers.find(x=>x.role==='CONTRE_ANALYSE')||null})}],10000);
   reviewers.push({role:'CONTROLE_RISQUE',provider:cloudflare.name,model:cloudflare.model,latencyMs:Date.now()-started,ok:true,...audit});
  }catch(e){reviewers.push({role:'CONTROLE_RISQUE',provider:cloudflare.name,model:cloudflare.model,latencyMs:Date.now()-started,ok:false,error:clean(e.message,180)});}
 }
 const critic=reviewers.find(x=>x.role==='CONTRE_ANALYSE'&&x.ok);
 const audit=reviewers.find(x=>x.role==='CONTROLE_RISQUE'&&x.ok);
 const blockers=[...(Array.isArray(critic?.criticalBlockers)?critic.criticalBlockers:[]),...(Array.isArray(audit?.criticalBlockers)?audit.criticalBlockers:[])].map(x=>clean(x,240)).filter(Boolean);
 const veto=Boolean(audit?.veto);
 let decision=['BUY','SELL','WAIT'].includes(String(main.decision||'').toUpperCase())?String(main.decision).toUpperCase():'WAIT';
 let synthesisReason='Décision principale Groq conservée après les contrôles disponibles.';
 if(veto){decision='WAIT';synthesisReason='Scénario suspendu : Cloudflare a identifié un blocage critique. '+clean(audit.reasoning,500);}
 else if(blockers.length){decision='WAIT';synthesisReason='Scénario suspendu en raison de points critiques soulevés par la contre-analyse ou le contrôle des risques.';}
 else if(critic?.verdict==='CONTESTE'&&critic?.alternativeDecision==='WAIT'){decision='WAIT';synthesisReason='OpenRouter conteste le scénario et recommande ATTENTE ; prudence retenue.';}
 const marketReadingScore=Number.isFinite(Number(main.marketReadingScore))?Math.max(0,Math.min(100,Math.round(Number(main.marketReadingScore)))):null;
 const collaboration={mode:'THREE_ROLE_REVIEW',primary:primaryInfo,reviewers,decisionBeforeReview:String(main.decision||'WAIT').toUpperCase(),decisionAfterReview:decision,synthesisReason,criticalBlockers:blockers,marketReadingScore,marketReadingFactors:Array.isArray(main.marketReadingFactors)?main.marketReadingFactors.slice(0,8):[],buyConfirmationScore:main.buy?.confirmationScore??null,sellConfirmationScore:main.sell?.confirmationScore??null,disclaimer:'Les modèles sont des aides à l’analyse. Un contrôle manquant ne vaut pas validation ; les scénarios restent à confirmer par les données et la gestion du risque.'};
 return {data:{...main,decision,collaboration},provider:'AUREVIA · collaboration 3 IA',model:primary.model,attempts:reviewers.filter(x=>!x.ok)};
}
