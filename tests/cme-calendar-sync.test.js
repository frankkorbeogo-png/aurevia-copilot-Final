import test from 'node:test';
import assert from 'node:assert/strict';
import {handler as scheduledCmeCalendarSync} from '../netlify/functions/cme-calendar-sync.mjs';

test('CME scheduler refuses to run without Supabase configuration',async()=>{
 const old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 try{const r=await scheduledCmeCalendarSync();assert.equal(r.statusCode,503);assert.equal(JSON.parse(r.body).code,'SUPABASE_CONFIG_MISSING');}
 finally{if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;if(old.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old.key;}
});

test('CME scheduler stores a source snapshot as unverified information, never as an automatic market closure',async()=>{
 const old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};const original=globalThis.fetch;
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';
 let saved=null,sourceCalls=0;
 globalThis.fetch=async(input,options={})=>{const url=String(input);if(url==='https://www.cmegroup.com/trading-hours.html'){sourceCalls++;return new Response('<html><h1>2026 CME Globex Trading Schedule</h1>'+('Calendar source capture '.repeat(100))+'</html>',{status:200});}if(url.startsWith('https://example.supabase.co/rest/v1/cme_calendar_sync')){saved=JSON.parse(options.body);return new Response(null,{status:201});}throw new Error('URL inattendue '+url);};
 try{const r=await scheduledCmeCalendarSync();const data=JSON.parse(r.body);assert.equal(r.statusCode,200);assert.equal(data.ok,true);assert.equal(data.automaticMarketClosuresApplied,false);assert.equal(sourceCalls,1);assert.equal(saved.source_key,'cme-globex-holiday-calendar');assert.equal(saved.holiday_candidates.length,0);assert.ok(saved.content_hash);}
 finally{globalThis.fetch=original;if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;if(old.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old.key;}
});

test('CME refuses unexpected source content without overwriting the snapshot',async()=>{
 const old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};const original=globalThis.fetch;
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-test';let writes=0;
 globalThis.fetch=async input=>{const url=String(input);if(url==='https://www.cmegroup.com/trading-hours.html')return new Response('<html><h1>Page unavailable</h1>'+('x'.repeat(1200))+'</html>',{status:200});if(url.startsWith('https://example.supabase.co/')){writes++;return new Response(null,{status:201});}throw new Error('URL inattendue '+url);};
 try{const r=await scheduledCmeCalendarSync();const data=JSON.parse(r.body);assert.equal(r.statusCode,422);assert.equal(data.code,'CME_SOURCE_MARKER_MISSING');assert.equal(writes,0);}
 finally{globalThis.fetch=original;if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;if(old.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old.key;}
});
