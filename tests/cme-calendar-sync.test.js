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
