import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [auth,app,html]=await Promise.all([
 readFile(new URL('../auth.js',import.meta.url),'utf8'),
 readFile(new URL('../app.js',import.meta.url),'utf8'),
 readFile(new URL('../index.html',import.meta.url),'utf8')
]);

test('les paramètres de gestion du compte sont persistés par utilisateur dans user_preferences',()=>{
 assert.match(auth,/loadRiskManagementSettings\(expectedUserId=null\)/);
 assert.match(auth,/saveRiskManagementSettings\(settings,expectedUserId=null\)/);
 assert.match(auth,/risk_management:clean/);
 assert.match(auth,/\.eq\('user_id',userId\)/);
 assert.match(auth,/raw_ecn/);
});

test('le gestionnaire expose broker, type, equity, marge, levier, drawdown et limites de pertes',()=>{
 for(const id of ['riskBrokerName','riskAccountType','accountBalance','accountCurrency','riskEquity','riskMarginUsed','riskLeverage','riskPeakEquity','riskDailyLossLimit','riskWeeklyLossLimit','riskFreeMarginOut','riskDailyPnlOut','riskDailyRemainingOut','riskWeeklyPnlOut','riskWeeklyRemainingOut','riskDrawdownOut','saveRiskControls']){
  assert.ok(html.includes('id="'+id+'"'),'champ manquant: '+id);
 }
 assert.doesNotMatch(html,/id="accountBalance"[^>]*value="200"/);
 assert.match(html,/P\/L de ces limites repose sur les clôtures enregistrées, pas sur le P\/L flottant/);
});

test('les résultats journaliers et hebdomadaires sont calculés depuis les clôtures enregistrées et le journal manuel',()=>{
 assert.match(app,/function getRiskPeriodPnl\(\)/);
 assert.match(app,/close\.net\?\?close\.pnl\?\.net/);
 assert.match(app,/loadJournalTrades\(\)/);
 assert.match(app,/Africa\/Ouagadougou/);
 assert.match(app,/calculateRiskControls\(/);
});

test('les paramètres sont chargés après connexion et enregistrés avec contrôle du compte actif',()=>{
 assert.match(app,/refreshRiskManagement\(\)/);
 assert.match(app,/saveRiskManagementSettings\([\s\S]*?ownerId\)/);
 assert.match(app,/riskPeakEquity/);
});
