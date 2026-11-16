import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handler,normalizeArticle,buildFomcReleaseEvents} from '../netlify/functions/global-news-sync.mjs';

test('global-news-sync returns an error when one macro subsystem fails',async()=>{
 const old={...process.env};
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='service';
 delete process.env.FRED_API_KEY;
 delete process.env.TELEGRAM_BOT_TOKEN;
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  if(String(input).includes('api.gdeltproject.org'))return new Response('GDELT unavailable',{status:503,headers:{'content-type':'text/plain'}});
  throw new Error('URL inattendue '+String(input));
 };
 try{
  const r=await handler({httpMethod:'POST'});
  const data=JSON.parse(r.body);
  assert.equal(r.statusCode,502);
  assert.match(data.globalNewsError,/GDELT HTTP 503/);
 }finally{
  globalThis.fetch=original;
  for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];
  Object.assign(process.env,old);
 }
});

test('GDELT seendate est stocké comme heure observée et non comme publication média',()=>{
 const now=new Date();
 const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const article=normalizeArticle({url:'https://example.com/macro-story',title:'Central bank update',seendate:stamp,domain:'example.com',language:'English',sourcecountry:'United States'});
 assert.ok(article);
 assert.equal(article.published_at,null);
 assert.ok(article.seen_at);
 assert.ok(Math.abs(Date.now()-Date.parse(article.seen_at))<5000);
});

test('le calendrier FOMC inclut les jours de décision officiels et exclut la réunion stratégique 2027',()=>{
 const events=buildFomcReleaseEvents(new Date('2026-11-15T00:00:00Z'),500);
 const dates=events.map(x=>x.release_date);
 assert.ok(dates.includes('2026-12-09'));
 assert.ok(dates.includes('2027-01-27'));
 assert.ok(dates.includes('2027-11-17'));
 assert.ok(!dates.includes('2027-10-27'));
 assert.ok(events.every(x=>x.source_url==='https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'));
});

test('la migration distingue seen_at de published_at sans perdre les anciens articles',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261115235000_global_news_seen_at.sql',import.meta.url),'utf8');
 assert.match(sql,/add column if not exists seen_at timestamptz/);
 assert.match(sql,/set seen_at = coalesce\(seen_at, published_at, created_at\)/);
 assert.match(sql,/alter column published_at drop not null/);
 assert.match(sql,/global_news_events_seen_idx/);
});


test('un cache FRED frais ne désactive pas les publications FRED existantes',async()=>{
 const old={...process.env};
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='service';
 process.env.FRED_API_KEY='fred-test';
 delete process.env.TELEGRAM_BOT_TOKEN;
 const original=globalThis.fetch;
 const patched=[];
 const existing=[
  {id:'fred-cpi',external_id:'FRED-10-2026-11-20',release_id:10,scheduled_at:'2026-11-20T13:30:00.000Z',is_active:true},
  {id:'fomc-old',external_id:'FRED-101-2026-11-20',release_id:101,scheduled_at:'2026-11-20T19:00:00.000Z',is_active:true}
 ];
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(String(input));
  if(url.hostname==='example.supabase.co'){
   if(url.pathname.endsWith('/economic_release_sync_state'))return Response.json([{last_synced_at:new Date().toISOString()}]);
   if(url.pathname.endsWith('/economic_release_events')&&(!options.method||options.method==='GET'))return Response.json(existing);
   if(url.pathname.endsWith('/economic_release_events')&&options.method==='PATCH'){
    patched.push({url:url.toString(),body:JSON.parse(options.body)});
    return new Response(null,{status:204});
   }
   if(url.pathname.endsWith('/global_news_events'))return Response.json([]);
   throw new Error('Requête Supabase inattendue '+url.pathname+' '+(options.method||'GET'));
  }
  if(url.hostname==='api.gdeltproject.org')return Response.json({articles:[]});
  throw new Error('URL inattendue '+url.toString());
 };
 try{
  const r=await handler({httpMethod:'POST'});
  const data=JSON.parse(r.body);
  assert.equal(r.statusCode,200);
  assert.equal(data.economicCalendar.status,'fresh_fred_cache_official_fomc_refreshed');
  assert.equal(patched.length,1);
  assert.match(patched[0].url,/fomc-old/);
  assert.equal(patched[0].body.is_active,false);
  assert.ok(!patched.some(x=>x.url.includes('fred-cpi')),'la publication FRED doit rester active');
 }finally{
  globalThis.fetch=original;
  for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];
  Object.assign(process.env,old);
 }
});
