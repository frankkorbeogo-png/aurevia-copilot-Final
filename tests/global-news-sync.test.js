import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handler} from '../netlify/functions/global-news-sync.mjs';

test('global-news-sync reports a failed GDELT subsystem instead of claiming success',async()=>{
 const old={...process.env};process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service';delete process.env.FRED_API_KEY;delete process.env.TELEGRAM_BOT_TOKEN;
 const original=globalThis.fetch;globalThis.fetch=async input=>{if(String(input).includes('api.gdeltproject.org'))return new Response('GDELT unavailable',{status:503});throw new Error('URL inattendue '+String(input));};
 try{const r=await handler({httpMethod:'POST'});const data=JSON.parse(r.body);assert.equal(r.statusCode,502);assert.equal(data.ok,false);assert.match(data.globalNewsError,/GDELT HTTP 503/);}
 finally{globalThis.fetch=original;for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
});

test('global news distinguishes source observation time from publisher publication time',async()=>{
 const source=await readFile(new URL('../netlify/functions/global-news-sync.mjs',import.meta.url),'utf8');
 const sql=await readFile(new URL('../supabase/migrations/20261116090000_global_news_seen_at.sql',import.meta.url),'utf8');
 assert.match(source,/seen_at/);assert.match(source,/published_at/);
 assert.match(sql,/add column if not exists seen_at timestamptz/);
 assert.match(sql,/set seen_at = coalesce\(seen_at, published_at, created_at\)/);
 assert.match(sql,/alter column published_at drop not null/);
 assert.match(sql,/global_news_events_seen_idx/);
});
