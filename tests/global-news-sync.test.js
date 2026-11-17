import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handler,getFredDateRange} from '../netlify/functions/global-news-sync.mjs';

test('global-news-sync reports a failed GDELT subsystem instead of claiming success',async()=>{
 const old={...process.env};process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.FRED_API_KEY;delete process.env.TELEGRAM_BOT_TOKEN;
 const original=globalThis.fetch;globalThis.fetch=async input=>{if(String(input).includes('api.gdeltproject.org'))return new Response('GDELT unavailable',{status:503});throw new Error('URL inattendue '+String(input));};
 try{const r=await handler({httpMethod:'POST'});const data=JSON.parse(r.body);assert.equal(r.statusCode,502);assert.equal(data.ok,false);assert.match(data.globalNewsError,/GDELT HTTP 503/);}
 finally{globalThis.fetch=original;for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
});

test('global news distinguishes source observation time from publisher publication time',async()=>{
 const source=await readFile(new URL('../netlify/functions/global-news-sync.mjs',import.meta.url),'utf8');
 const schemaSql=await readFile(new URL('../supabase/migrations/20261116154433_global_news_seen_at.sql',import.meta.url),'utf8');
 const cleanupSql=await readFile(new URL('../supabase/migrations/20261116230400_aurevia_gdelt_publication_date_cleanup.sql',import.meta.url),'utf8');
 assert.match(source,/seen_at/);assert.match(source,/published_at/);
 assert.match(schemaSql,/add column if not exists seen_at timestamptz/);
 assert.match(schemaSql,/set seen_at = coalesce\\(seen_at, published_at, created_at\\)/);
 assert.match(schemaSql,/alter column published_at drop not null/);
 assert.match(schemaSql,/global_news_events_seen_idx/);
 assert.ok(cleanupSql.includes('set published_at = null')&&cleanupSql.includes("source_provider = 'GDELT DOC 2.0'"));
});


test('global-news-sync backs off after GDELT HTTP 429 and stores the recovered articles',async()=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','FRED_API_KEY','TELEGRAM_BOT_TOKEN'];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const oldFetch=globalThis.fetch,oldTimeout=globalThis.setTimeout;
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service';
 delete process.env.FRED_API_KEY;delete process.env.TELEGRAM_BOT_TOKEN;
 let gdeltCalls=0,inserted=[];
 const seenAt=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 globalThis.setTimeout=callback=>{queueMicrotask(callback);return 0;};
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url.includes('api.gdeltproject.org/api/v2/doc/doc')){
   gdeltCalls++;
   if(gdeltCalls===1)return new Response('rate limited',{status:429,headers:{'content-type':'text/plain','retry-after':'1'}});
   return new Response(JSON.stringify({articles:[{title:'Central bank signals policy update',url:'https://example.org/macro-story',seendate:seenAt,publishdate:seenAt,sourcecountry:'US',language:'English',tone:'-0.4'}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.includes('/rest/v1/global_news_events')&&options.method==='POST'){inserted=JSON.parse(options.body);return new Response(null,{status:204});}
  if(url.includes('/rest/v1/global_news_events'))return new Response('[]',{status:200});
  return new Response('[]',{status:200});
 };
 try{
  const response=await handler({httpMethod:'POST',body:'{}'}),body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);assert.equal(gdeltCalls,2);assert.equal(body.fetched,1);
  assert.equal(inserted.length,1);assert.equal(inserted[0].source_provider,'GDELT DOC 2.0');
  assert.equal(inserted[0].external_id.length,64);assert.equal(body.globalNewsError,undefined);
 }finally{
  globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimeout;
  for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
 }
});


test('FRED requests respect the two-requests-per-second limit and retry HTTP 429',async()=>{
 const source=await readFile(new URL('../netlify/functions/global-news-sync.mjs',import.meta.url),'utf8');
 assert.match(source,/for\(let i=0;i<RELEASES\.length;i\+=2\)/);
 assert.match(source,/await wait\(1100\)/);
 assert.match(source,/response\.status===429&&attempt===0/);
});

test('FRED release windows use the New York calendar date across UTC midnight',()=>{
 const range=getFredDateRange(new Date('2026-11-16T02:00:00.000Z'));
 assert.equal(range.today,'2026-11-15');
 assert.equal(range.end,'2026-11-29');
});

test('global-news and FRED sync run concurrently and stay within the scheduled function budget',async()=>{
 const source=await readFile(new URL('../netlify/functions/global-news-sync.mjs',import.meta.url),'utf8');
 assert.match(source,/Promise\.all\(\[economicTask,newsTask\]\)/);
 assert.match(source,/AbortSignal\.timeout\(5000\)/);
 assert.match(source,/AbortSignal\.timeout\(3500\)/);
});

test('les rappels économiques ne sont pas envoyés plus de 60 minutes avant l’événement',async()=>{
 const source=await readFile(new URL('../netlify/functions/global-news-sync.mjs',import.meta.url),'utf8');
 assert.match(source,/new Date\(now\.getTime\(\)\+60\*60\*1000\)/);
 assert.doesNotMatch(source,/new Date\(now\.getTime\(\)\+65\*60\*1000\)/);
});
