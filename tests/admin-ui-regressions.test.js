import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('permanent account deletion sends the exact confirmation phrase',()=>{
 assert.match(app,/const confirmation=permanent\?'SUPPRIMER DÉFINITIVEMENT':null/);
 assert.match(app,/phrase:'SUPPRIMER DÉFINITIVEMENT'/);
 assert.match(app,/permanent\?\{confirmation\}:\{\}/);
});
test('administrator console buttons have explicit handlers',()=>{
 for(const id of ['adminRefreshStatus','adminUsersPrev','adminUsersNext','adminCheckTelegramBot','adminCreateAnnouncement','adminIssueLicenses','adminRefreshLicenses'])
  assert.ok(app.includes("$('"+id+"')"),id);
 assert.match(app,/data-admin-action/);assert.match(app,/data-announcement-toggle/);assert.match(app,/data-announcement-expire/);
});

test('instrument specifications remain in Settings without broker name or account type',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('<section class="panel" id="brokerProfileSettings">');
 const end=html.indexOf('</section>',start);const settings=html.slice(start,end);
 assert.match(app,/loadBrokerSettings\(select.value,ownerId\)/);
 assert.match(app,/saveBrokerSettings\(instrument,spec,ownerId\)/);
 assert.doesNotMatch(settings,/riskBrokerName|riskAccountType|saveBrokerAccountProfile/);
 assert.match(html,/id="tradingConfigNotice"/);
 assert.match(html,/id="accountCurrencyNotice"/);
});
