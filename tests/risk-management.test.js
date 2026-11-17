import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [app,html]=await Promise.all([
 readFile(new URL('../app.js',import.meta.url),'utf8'),
 readFile(new URL('../index.html',import.meta.url),'utf8')
]);

test('le panneau equity, drawdown et limites de pertes est retiré de Gestion du capital',()=>{
 for(const id of ['riskAccountControls','riskEquity','riskMarginUsed','riskPeakEquity','riskDailyLossLimit','riskWeeklyLossLimit','riskFreeMarginOut','riskDailyPnlOut','riskDailyRemainingOut','riskWeeklyPnlOut','riskWeeklyRemainingOut','riskDrawdownOut','saveRiskControls'])assert.ok(!html.includes('id="'+id+'"'),'panneau supprimé : '+id);
 assert.doesNotMatch(html,/Suivi de l’equity et des limites|Limite de perte quotidienne|Limite de perte hebdomadaire|Drawdown depuis le pic/);
});

test('le calculateur de risque et les paramètres broker centralisés restent disponibles',()=>{
 assert.ok(html.includes('id="riskInstrument"'));
 assert.ok(html.includes('id="riskAmount"'));
 assert.ok(html.includes('id="slDistance"'));
 assert.ok(html.includes('id="calculateRisk"'));
 assert.ok(html.includes('id="riskBrokerProfileStatus"'));
 assert.match(app,/calculatePositionRisk\(/);
 assert.match(app,/applyRiskBrokerProfile\(/);
 assert.doesNotMatch(app,/renderRiskControls|refreshRiskManagement|saveRiskControls|calculateRiskControls/);
});

test('les paramètres broker restent dans Paramètres et ne sont pas redemandés dans Capital ou Positions',()=>{
 const settingsStart=html.indexOf('<section class="panel" id="brokerProfileSettings">');
 const settingsEnd=html.indexOf('</section>',settingsStart);
 const capitalStart=html.indexOf('data-page-view="risque"'),capitalEnd=html.indexOf('data-page-view="journal"',capitalStart);
 const positionsStart=html.indexOf('data-page-view="positions"'),positionsEnd=html.indexOf('data-page-view="validation-trade"',positionsStart);
 const settings=html.slice(settingsStart,settingsEnd),capital=html.slice(capitalStart,capitalEnd),positions=html.slice(positionsStart,positionsEnd);
 assert.ok(settings.includes('id="riskBrokerName"'));
 assert.ok(settings.includes('id="brokerProfileInstrument"'));
 assert.ok(!capital.includes('id="riskBrokerName"'));
 assert.ok(!capital.includes('id="riskAccountType"'));
 assert.ok(!positions.includes('id="posBrokerName"'));
 assert.ok(!positions.includes('id="posAccountType"'));
});
