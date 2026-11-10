const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
export async function handler(event){
 if(event.httpMethod!=='GET')return json(405,{error:'Method not allowed.'});
 const has=name=>Boolean(process.env[name]?.trim());
 const supabaseServer=has('SUPABASE_URL')&&has('SUPABASE_SERVICE_ROLE_KEY');
 return json(200,{services:{ai:{configured:has('GROQ_API_KEY')},marketData:{configured:has('TWELVEDATA_API_KEY')},supabase:{configured:supabaseServer},telegram:{configured:has('TELEGRAM_BOT_TOKEN')&&has('TELEGRAM_WEBHOOK_SECRET')&&(has('SUPABASE_PUBLISHABLE_KEY')||has('SUPABASE_ANON_KEY'))&&supabaseServer}},checkedAt:new Date().toISOString()});
}
