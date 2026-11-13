import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('les actions de l’application n’utilisent plus les alertes ou confirmations natives', async () => {
  const app = await read('app.js');
  assert.doesNotMatch(app, /\balert\s*\(/);
  assert.doesNotMatch(app, /\bconfirm\s*\(/);
  assert.match(app, /showInAppNotice/);
  assert.match(app, /await confirmInApp/);
});

test('le système AUREVIA fournit des retours visuels succès, erreur et information', async () => {
  const auth = await read('auth.js');
  const css = await read('style.css');
  assert.match(auth, /export function showInAppNotice/);
  assert.match(auth, /aurevia-feedback-\$\{kind\}/);
  assert.match(css, /\.aurevia-feedback-success/);
  assert.match(css, /\.aurevia-feedback-error/);
  assert.match(css, /\.aurevia-feedback-info/);
});

test('les confirmations sensibles utilisent une boîte de dialogue intégrée', async () => {
  const auth = await read('auth.js');
  const app = await read('app.js');
  assert.match(auth, /export function confirmInApp/);
  assert.match(app, /await confirmInApp\(\{title:'Confirmer l’action administrateur'/);
  assert.ok(app.includes("title:'Supprimer cette position ?'"));
  assert.ok(app.includes("title:'Supprimer cette entrée ?'"));
});
