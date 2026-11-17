import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildOfficialFomcEvents} from '../netlify/functions/global-news-sync.mjs';

const cleanup=await readFile(new URL('../supabase/migrations/20261117141530_aurevia_retire_invalid_fred_fomc_dates.sql',import.meta.url),'utf8');

test('le calendrier officiel publie les minutes du FOMC le 18 novembre 2026, pas une décision quotidienne',()=>{
 const events=buildOfficialFomcEvents(new Date('2026-11-16T12:00:00.000Z'));
 assert.equal(events.length,1);
 assert.equal(events[0].event_name,'FOMC Minutes');
 assert.equal(events[0].release_date,'2026-11-18');
 assert.equal(events[0].source_provider,'Federal Reserve official calendar');
 assert.equal(events[0].scheduled_at,'2026-11-18T19:00:00.000Z');
});

test('la décision FOMC de décembre 2026 est datée du second jour de réunion',()=>{
 const events=buildOfficialFomcEvents(new Date('2026-11-30T12:00:00.000Z'));
 assert.ok(events.some(x=>x.event_name==='FOMC monetary policy decision'&&x.release_date==='2026-12-09'&&x.scheduled_at==='2026-12-09T19:00:00.000Z'));
});

test('la réunion stratégique 2027 sans décision de taux ne crée pas de fausse alerte horaire',()=>{
 const events=buildOfficialFomcEvents(new Date('2027-10-15T12:00:00.000Z'));
 assert.equal(events.length,0);
});

test('la réunion de politique monétaire de novembre 2027 est au 17 novembre',()=>{
 const events=buildOfficialFomcEvents(new Date('2027-11-03T12:00:00.000Z'));
 assert.ok(events.some(x=>x.event_name==='FOMC monetary policy decision'&&x.release_date==='2027-11-17'));
});

test('la migration désactive les anciennes alertes quotidiennes FOMC issues de FRED',()=>{
 assert.match(cleanup,/UPDATE public\.economic_release_events/);
 assert.match(cleanup,/release_id = 101/);
 assert.match(cleanup,/source_provider = 'FRED release calendar'/);
 assert.match(cleanup,/SET is_active = false/);
});

test('le calendrier couvre aussi la réunion confirmée de janvier 2028',()=>{
 const events=buildOfficialFomcEvents(new Date('2028-01-12T12:00:00.000Z'));
 assert.ok(events.some(x=>x.event_name==='FOMC monetary policy decision'&&x.release_date==='2028-01-26'));
});
