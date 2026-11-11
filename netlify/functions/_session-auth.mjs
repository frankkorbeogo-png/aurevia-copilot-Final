const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readEnv=name=>(process.env[name]||'').trim();
export function readBearer(event){const value=event.headers?.authorization||event.headers?.Authorization||'';return value.replace(/^Bearer\s+/i,'').trim();}
export function decodeClaims(token){try{const part=token.split('.')[1];if(!part)return null;return JSON.parse(Buffer.from(part,'base64url').toString('utf8'));}catch{return null;}}
export async function verifyBearerUser(event){
 const token=readBearer(event);
 if(!token)throw Object.assign(new Error('Connexion requise.'),{statusCode:401});
 const base=readEnv('SUPABASE_URL').replace(/\/$/,''),publishable=readEnv('SUPABASE_PUBLISHABLE_KEY')||readEnv('SUPABASE_ANON_KEY'),service=readEnv('SUPABASE_SERVICE_ROLE_KEY');
 if(!base||!publishable||!service)throw Object.assign(new Error('Session backend non configuré.'),{statusCode:503});
 const response=await fetch(`${base}/auth/v1/user`,{headers:{apikey:publishable,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Object.assign(new Error('Session utilisateur invalide ou expirée.'),{statusCode:401});
 const user=await response.json(),claims=decodeClaims(token);
 if(!user?.id||claims?.sub!==user.id||!UUID.test(String(claims?.session_id||'')))throw Object.assign(new Error('Identifiant de session Supabase invalide.'),{statusCode:401});
 return {base,publishable,service,token,user,sessionId:claims.session_id};
}
export async function rpc(base,service,name,args){
 const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:service,authorization:`Bearer ${service}`,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(new Error(data?.message||data?.msg||data?.error||`RPC ${name} indisponible (${response.status}).`),{statusCode:response.status===404?503:500});
 return data;
}
export async function assertActiveSession(context){
 const active=await rpc(context.base,context.service,'aurevia_session_is_active_for_user',{p_user_id:context.user.id,p_session_id:context.sessionId});
 if(active!==true)throw Object.assign(new Error('Cette session a été remplacée ou révoquée. Reconnectez-vous avec Google.'),{statusCode:409,code:'SESSION_REPLACED'});
 return true;
}
export const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
