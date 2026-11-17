import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('la clé de licence est saisissable dans les Paramètres même pendant la démo',async()=>{
 const html=await read('index.html'),app=await read('app.js');
 assert.match(html,/id="settingsLicensePanel"/);
 assert.match(html,/id="settingsLicenseKeyInput"/);
 assert.match(html,/id="settingsActivateLicenseBtn"/);
 assert.match(app,/settingsActivateLicenseBtn/);
 assert.match(app,/activateUserLicense\('settingsLicenseKeyInput','settingsActivateLicenseBtn','settingsLicenseStatus'\)/);
});
test('la fenêtre bloquante conserve un champ d’activation pour une licence expirée',async()=>{
 const html=await read('index.html'),app=await read('app.js');
 assert.match(html,/id="licenseKeyInput"/);
 assert.match(html,/id="activateLicenseBtn"/);
 assert.match(app,/async function activateUserLicense\(inputId='licenseKeyInput'/);
});
