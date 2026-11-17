import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const migrationDir=new URL('../supabase/migrations/',import.meta.url);
const names=(await readdir(migrationDir)).filter(x=>x.endsWith('.sql')).sort();
const versions=names.map(x=>x.slice(0,14));
const pending=[
 '20261116184406','20261116185127','20261116185500','20261116190000',
 '20261116190500','20261116191000','20261116192500','20261116193000',
 '20261116194000','20261116195000','20261116220000','20261116221000',
 '20261116223000','20261116230000','20261116230100','20261116230200','20261116230300','20261116230400','20261116230500','20261117112653','20261117112653'
];

test('le dossier de production contient 63 migrations historiques canoniques et 20 migrations de livraison',()=>{
 assert.equal(names.length,84);
 assert.equal(new Set(versions).size,84);
 assert.ok(names.some(x=>x.startsWith('20261110073307_create_aurevia_core_tables')));
 assert.ok(names.some(x=>x.startsWith('20261116160908_aurevia_manual_journal_cloud_sync')));
 assert.ok(names.some(x=>x.startsWith('20261117074953_aurevia_privacy_policy_acceptances')));
 for(const version of pending)assert.ok(names.some(x=>x.startsWith(version+'_')),'migration de livraison absente: '+version);
});

test('aucun snapshot de staging ni ancienne politique DELETE Telegram directe ne peut être poussé en production',()=>{
 assert.ok(names.every(x=>!/staging|allow_users_to_unlink_own_telegram/i.test(x)));
});

test('les snapshots de staging et les migrations retirées sont archivés hors du dossier de production',async()=>{
 const staging=await readdir(new URL('../supabase/staging-bootstrap/',import.meta.url));
 const retired=await readdir(new URL('../supabase/retired-migrations/',import.meta.url));
 assert.ok(staging.includes('README.md'));
 assert.ok(staging.some(x=>x.includes('staging_schema_snapshot_tables')));
 assert.ok(retired.includes('20261112190000_allow_users_to_unlink_own_telegram.sql'));
 const plan=await readFile(new URL('../supabase/RELEASE-MIGRATION-PLAN-2.4.19.md',import.meta.url),'utf8');
 assert.match(plan,/63 migrations appliquées/);
 assert.match(plan,/19 migrations/);
});
