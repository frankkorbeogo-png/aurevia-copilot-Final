import test from 'node:test';
import assert from 'node:assert/strict';
import scheduledCmeCalendarSync from '../netlify/functions/cme-calendar-sync.mjs';

test('CME scheduled entrypoint uses the native Request/Response handler contract',async()=>{
 const response=await scheduledCmeCalendarSync(new Request('https://aurevia.local/.netlify/functions/cme-calendar-sync',{method:'POST'}));
 assert.equal(response.status,503);
 const data=await response.json();
 assert.equal(data.ok,false);
 assert.match(data.error,/Configuration Supabase absente/);
});

test('CME scheduler récupère la page source et persiste un instantané via Request/Response',async()=>{
 const old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 const original=globalThis.fetch;process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';
 let saved=null,sourceCalls=0;
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url==='https://www.cmegroup.com/trading-hours.html'){sourceCalls++;return new Response('<html><h1>CME Globex Trading Schedule</h1><p>Holiday hours</p></html>',{status:200,headers:{'content-type':'text/html'}});}
  if(url==='https://example.supabase.co/rest/v1/cme_calendar_sync?on_conflict=source_key'){
   assert.equal(options.method,'POST');
   assert.equal(options.headers.apikey,'service-test');
   saved=JSON.parse(options.body);return new Response(null,{status:201});
  }
  throw new Error('URL inattendue '+url);
 };
 try{
  const response=await scheduledCmeCalendarSync(new Request('https://aurevia.local/.netlify/functions/cme-calendar-sync',{method:'POST'}));
  const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.ok,true);assert.equal(data.status,'review_required');
  assert.equal(sourceCalls,1);assert.equal(saved.source_key,'cme-globex-holiday-calendar');
  assert.equal(saved.parse_status,'review_required');assert.equal(saved.holiday_candidates.length,0);
  assert.ok(saved.content_hash);assert.ok(saved.source_excerpt.includes('CME Globex Trading Schedule'));
 }finally{
  globalThis.fetch=original;
  if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;
  if(old.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old.key;
 }
});
