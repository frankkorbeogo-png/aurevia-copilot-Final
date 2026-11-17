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
