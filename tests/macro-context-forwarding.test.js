import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMacroContextForAI} from '../macro-context-forwarding.js';

test('transmet à l’IA les sources macro partielles sans les effacer',()=>{
 const context={configured:false,dxy:{configured:false,notice:'DXY horodatage absent'},fred:{availableSeries:4,totalSeries:6},calendar:{configured:true,events:[{event:'CPI'}]},globalNews:{configured:false,notice:'Migration absente'}};
 assert.deepEqual(buildMacroContextForAI(context),context);
});

test('signale explicitement un contexte macro absent sans inventer de valeurs',()=>{
 const result=buildMacroContextForAI(null);
 assert.equal(result.configured,false);
 assert.match(result.notice,/indisponible/);
});
