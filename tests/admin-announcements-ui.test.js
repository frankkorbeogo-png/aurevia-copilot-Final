import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('le formulaire admin expose le choix annonce générale ou ciblée', () => {
  assert.match(html, /id="adminAnnouncementAudience"[\s\S]*value="all"[\s\S]*value="selected"/);
  assert.match(html, /id="adminAnnouncementRecipients" multiple/);
});

test('le mode ciblé conserve les destinataires sélectionnés et les transmet à l’API', () => {
  assert.match(app, /adminSelectedAnnouncementRecipients=new Map\(\)/);
  assert.match(app, /adminAnnouncementRecipients.*addEventListener\('change'/s);
  assert.match(app, /audience,recipient_ids:recipientIds/);
  assert.match(app, /Sélectionnez au moins un destinataire pour une annonce ciblée/);
  assert.match(app, /recipientIds.length>100/);
});

test('le mode général transmet explicitement une audience générale sans destinataire', () => {
  assert.match(app, /audience==='selected'\?\[\.\.\.adminSelectedAnnouncementRecipients\.keys\(\)\]:\[\]/);
});
