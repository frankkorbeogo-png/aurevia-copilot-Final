import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [html,app]=await Promise.all([readFile(new URL('../index.html',import.meta.url),'utf8'),readFile(new URL('../app.js',import.meta.url),'utf8')]);

test('aucune documentation ne présente M1 comme unité de confirmation d’entrée',()=>{
 assert.doesNotMatch(html,/M1\s*·\s*Entrée/);
 assert.doesNotMatch(html,/M5\s*\/\s*M1\s*—\s*Précision/);
 assert.doesNotMatch(html,/affinage visuel M5\/M1/);
 assert.match(html,/confirmation IA sur M5, après mitigation de la zone d’opportunité M30/);
 assert.match(html,/M1 reste une vue facultative et ne confirme jamais l’entrée/);
});

test('le guide décrit les trois rôles IA de la confirmation M5',()=>{
 assert.match(html,/Groq propose le prix de référence/);
 assert.match(html,/OpenRouter le contre-vérifie/);
 assert.match(html,/Cloudflare contrôle le risque/);
});

test('les estimations de réussite ne sont pas présentées comme des probabilités statistiques calibrées',()=>{
 assert.doesNotMatch(app,/Probabilité statistique/);
 assert.match(app,/Estimation IA non calibrée/);
});
