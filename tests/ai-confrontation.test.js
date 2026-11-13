import test from 'node:test';
import assert from 'node:assert/strict';
import {handler} from '../netlify/functions/ai-confrontation.mjs';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
test('le endpoint de confrontation Groq refuse les méthodes non POST',async()=>{const r=await handler({httpMethod:'GET'});assert.equal(r.statusCode,405);});
test('la confrontation passe par le routeur AUREVIA côté serveur et impose une analyse M15',async()=>{const s=await read('../netlify/functions/ai-confrontation.mjs');assert.match(s,/runAureviaAI/);assert.match(s,/decisionTimeframe:'M15'/);assert.match(s,/ne modifie pas les niveaux chiffrés/);assert.match(s,/assertActiveSession/);});
test('le bouton de confrontation appelle le nouvel endpoint AUREVIA et rédige une synthèse éditable',async()=>{const s=await read('../app.js');assert.match(s,/api\/ai-confrontation/);assert.match(s,/CONFRONTATION AUREVIA \/ TRADER/);assert.match(s,/scenarioFinalSummary/);assert.match(s,/POINTS D’ACCORD/);assert.match(s,/DÉSACCORDS ET CONTRADICTIONS/);});
test('la route API de confrontation est déclarée',async()=>{const s=await read('../netlify.toml');assert.match(s,/from = "\/api\/ai-confrontation"/);assert.match(s,/\.netlify\/functions\/ai-confrontation/);});
