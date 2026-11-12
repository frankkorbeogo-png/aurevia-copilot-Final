import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../netlify/functions/ai-analysis.mjs',import.meta.url),'utf8');
test('les niveaux IA exigent des nombres positifs explicites et rejettent null',()=>{
 assert.match(source,/const finitePositive=v=>typeof v==='number'&&Number\.isFinite\(v\)&&v>0/);
 assert.match(source,/finitePositive\(result\.entry\)&&finitePositive\(result\.stopLoss\)/);
 assert.doesNotMatch(source,/Number\.isFinite\(Number\(result\.entry\)\)/);
});
test('les TP doivent être ordonnés dans le sens du trade',()=>{
 assert.match(source,/tps\.every\(\(v,i\)=>i===0\|\|v>tps\[i-1\]\)/);
 assert.match(source,/tps\.every\(\(v,i\)=>i===0\|\|v<tps\[i-1\]\)/);
});
test('les ordres LIMIT et STOP rejettent les champs inutiles et incohérents',()=>{
 assert.match(source,/result\.triggerPrice===null\|\|result\.triggerPrice===undefined/);
 assert.match(source,/result\.limitPrice===null\|\|result\.limitPrice===undefined/);
 assert.match(source,/Number\(result\.limitPrice\)<=Number\(result\.triggerPrice\)/);
 assert.match(source,/Number\(result\.limitPrice\)>=Number\(result\.triggerPrice\)/);
});
test('une proposition rejetée devient WAIT et efface ses niveaux',()=>{
 assert.match(source,/result\.decision='WAIT'/);
 assert.match(source,/result\.pendingOrderType=null/);
 assert.match(source,/result\.takeProfits=\[\]/);
});
