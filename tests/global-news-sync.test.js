import test from 'node:test';
import assert from 'node:assert/strict';
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
 const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\\.\\d{3}Z$/,'Z');
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
