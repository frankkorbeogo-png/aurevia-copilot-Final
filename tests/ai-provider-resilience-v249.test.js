import test from 'node:test';
import assert from 'node:assert/strict';
import { runAureviaAI } from '../netlify/functions/_ai-provider.mjs';

const keys = ['GEMINI_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GROQ_API_KEY'];
function setKeys(t, enabled = keys) {
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) enabled.includes(k) ? process.env[k] = `test-${k}` : delete process.env[k];
  t.after(() => keys.forEach(k => previous[k] === undefined ? delete process.env[k] : process.env[k] = previous[k]));
}
function ok() { return new Response(JSON.stringify({choices:[{message:{content:'{"decision":"WAIT"}'}}]}), {status:200}); }

test('Gemini 503 temporaire est retenté une fois puis bascule sur Cloudflare', async t => {
  setKeys(t, ['GEMINI_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']);
  const original = globalThis.fetch; const hosts=[];
  globalThis.fetch = async url => { hosts.push(new URL(url).hostname); return hosts.length<=2 ? new Response('{"error":{"message":"high demand"}}',{status:503}) : ok(); };
  t.after(()=>globalThis.fetch=original);
  const result=await runAureviaAI({messages:[{role:'system',content:'sys'},{role:'user',content:'{}'}]});
  assert.equal(result.provider,'Cloudflare');
  assert.deepEqual(hosts,['generativelanguage.googleapis.com','generativelanguage.googleapis.com','api.cloudflare.com']);
});

test('Groq 413 déclenche une seule requête compactée avant le succès', async t => {
  setKeys(t, ['GROQ_API_KEY']);
  const original=globalThis.fetch; const bodies=[];
  globalThis.fetch=async (_url,opts)=>{ bodies.push(JSON.parse(opts.body)); return bodies.length===1 ? new Response('{"error":{"message":"payload too large"}}',{status:413}) : ok(); };
  t.after(()=>globalThis.fetch=original);
  const candles=Array.from({length:40},(_,i)=>({t:String(i),o:1,h:2,l:0,c:1}));
  const result=await runAureviaAI({messages:[{role:'system',content:'system'},{role:'user',content:JSON.stringify({candles,patterns:[1,2,3,4,5,6],context:{h4:'x'.repeat(3000),m30:'y'.repeat(3000),macro:'z'.repeat(3000)}})}]});
  assert.equal(result.provider,'Groq');
  assert.equal(bodies.length,2);
  assert.equal(JSON.parse(bodies[0].messages[1].content).candles.length,40);
  assert.equal(JSON.parse(bodies[1].messages[1].content).candles.length,20);
  assert.equal(JSON.parse(bodies[1].messages[1].content).patterns.length,4);
});

test('Cloudflare timeout laisse le routeur atteindre Groq', async t => {
  setKeys(t, ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GROQ_API_KEY']);
  const original=globalThis.fetch; const hosts=[];
  globalThis.fetch=async url=>{hosts.push(new URL(url).hostname); if(hosts.length===1) throw Object.assign(new Error('timeout'),{name:'TimeoutError'}); return ok();};
  t.after(()=>globalThis.fetch=original);
  const result=await runAureviaAI({messages:[{role:'user',content:'{}'}]});
  assert.equal(result.provider,'Groq');
  assert.deepEqual(hosts,['api.cloudflare.com','api.groq.com']);
});
