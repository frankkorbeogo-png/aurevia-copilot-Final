import test from 'node:test'; import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises';
const read=async p=>readFile(new URL(p,import.meta.url),'utf8');
test('le prompt exige des directives conditionnelles quand aucun scénario ne tient',async()=>{const s=await read('../netlify/functions/ai-analysis.mjs');assert.match(s,/noScenarioReason/);assert.match(s,/watchDirectives/);assert.match(s,/Ne donne aucun ordre immédiat/);});
test('les directives WAIT sont transmises et affichées',async()=>{const a=await read('../analysis.js'),u=await read('../app.js');assert.match(a,/watchDirectives:aiResult\?\.watchDirectives/);assert.match(u,/DIRECTIVES À ATTENDRE/);});
test('les noms de fournisseurs sont masqués dans les diagnostics visibles',async()=>{const a=await read('../analysis.js'),u=await read('../app.js'),h=await read('../index.html');assert.match(a,/return `AUREVIA :/);assert.doesNotMatch(u,/SYNTHÈSE GROQ/);assert.doesNotMatch(h,/Plan proposé par l’IA/);});
