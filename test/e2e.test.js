'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const realmService = require('../src/realmService');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const { EXPORT_DIR } = require('../src/exportService');

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('HTTP API end-to-end: open, schema, CRUD qua HTTP that su', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  const app = createApp();
  const server = await startServer(app);
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    realmService.closeRealm();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const openRes = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex }),
  });
  const openBody = await openRes.json();
  assert.equal(openRes.status, 200);
  assert.equal(openBody.ok, true);
  assert.ok(openBody.data.schema.some((s) => s.name === 'Person'));

  const listRes = await fetch(`${base}/api/objects/Person`);
  const listBody = await listRes.json();
  assert.equal(listBody.data.total, 2);

  const page1Res = await fetch(`${base}/api/objects/Person?limit=1&offset=0`);
  const page1Body = await page1Res.json();
  assert.equal(page1Body.data.returned, 1);
  assert.equal(page1Body.data.offset, 0);

  const page2Res = await fetch(`${base}/api/objects/Person?limit=1&offset=1`);
  const page2Body = await page2Res.json();
  assert.equal(page2Body.data.returned, 1);
  assert.equal(page2Body.data.offset, 1);
  assert.notEqual(page1Body.data.rows[0].__ref, page2Body.data.rows[0].__ref);

  const countRes = await fetch(`${base}/api/objects/Person/count`);
  const countBody = await countRes.json();
  assert.equal(countRes.status, 200);
  assert.equal(countBody.data.total, 2);

  const exportRes = await fetch(`${base}/api/objects/Person/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: '', format: 'csv' }),
  });
  const exportBody = await exportRes.json();
  assert.equal(exportRes.status, 200);
  assert.equal(exportBody.ok, true);
  assert.equal(exportBody.data.rowCount, 2);
  const exportedPath = path.join(EXPORT_DIR, exportBody.data.fileName);
  assert.ok(fs.existsSync(exportedPath), 'exported file should actually exist on disk');
  fs.rmSync(exportedPath, { force: true });

  const badFormatRes = await fetch(`${base}/api/objects/Person/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: '', format: 'pdf' }),
  });
  const badFormatBody = await badFormatRes.json();
  assert.equal(badFormatRes.status, 400);
  assert.equal(badFormatBody.ok, false);

  const csvContent = 'id,name,age,active\np9,Zed,50,true\n';
  const importRes = await fetch(`${base}/api/objects/Person/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: csvContent, mode: 'append', format: 'csv' }),
  });
  const importBody = await importRes.json();
  assert.equal(importRes.status, 200);
  assert.equal(importBody.ok, true);
  assert.equal(importBody.data.insertedCount, 1);
  const afterImportRes = await fetch(`${base}/api/objects/Person`);
  const afterImportBody = await afterImportRes.json();
  assert.equal(afterImportBody.data.total, 3, 'the imported row must be visible alongside the original 2');

  const markdownContent = '| id | name | age | active |\n| --- | --- | --- | --- |\n| p10 | Yara | 33 | true |\n';
  const importMarkdownRes = await fetch(`${base}/api/objects/Person/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: markdownContent, mode: 'append', format: 'markdown' }),
  });
  const importMarkdownBody = await importMarkdownRes.json();
  assert.equal(importMarkdownRes.status, 200);
  assert.equal(importMarkdownBody.ok, true);
  assert.equal(importMarkdownBody.data.insertedCount, 1);
  const afterImportMarkdownRes = await fetch(`${base}/api/objects/Person`);
  const afterImportMarkdownBody = await afterImportMarkdownRes.json();
  assert.equal(afterImportMarkdownBody.data.total, 4, 'the Markdown-imported row must be visible alongside the previous 3');

  const badModeRes = await fetch(`${base}/api/objects/Person/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: csvContent, mode: 'merge', format: 'csv' }),
  });
  const badModeBody = await badModeRes.json();
  assert.equal(badModeRes.status, 400);
  assert.equal(badModeBody.ok, false);

  const badImportFormatRes = await fetch(`${base}/api/objects/Person/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: csvContent, mode: 'append', format: 'xml' }),
  });
  const badImportFormatBody = await badImportFormatRes.json();
  assert.equal(badImportFormatRes.status, 400);
  assert.equal(badImportFormatBody.ok, false);

  const createRes = await fetch(`${base}/api/objects/Person`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p3', name: 'Carol', age: '40', active: true }),
  });
  const createBody = await createRes.json();
  assert.equal(createBody.ok, true);
  assert.equal(createBody.data.name, 'Carol');

  const updateRes = await fetch(`${base}/api/objects/Person/p3`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Carol Updated' }),
  });
  const updateBody = await updateRes.json();
  assert.equal(updateBody.data.name, 'Carol Updated');

  const deleteRes = await fetch(`${base}/api/objects/Person/p3`, { method: 'DELETE' });
  const deleteBody = await deleteRes.json();
  assert.equal(deleteBody.ok, true);

  const importFolderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-dev-tool-e2e-import-folder-'));
  fs.writeFileSync(path.join(importFolderDir, 'Person_20261021_003537.csv'), 'id,name,age,active\np8,Wendy,44,true\n', 'utf8');
  fs.writeFileSync(path.join(importFolderDir, 'abc_20260821_003537.md'), '| x |\n| --- |\n| 1 |\n', 'utf8');
  t.after(() => fs.rmSync(importFolderDir, { recursive: true, force: true }));

  const scanRes = await fetch(`${base}/api/import/folder/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: importFolderDir }),
  });
  const scanBody = await scanRes.json();
  assert.equal(scanRes.status, 200);
  assert.equal(scanBody.ok, true);
  assert.equal(scanBody.data.matched.length, 1);
  assert.equal(scanBody.data.matched[0].className, 'Person');
  assert.equal(scanBody.data.skipped.length, 1);
  assert.equal(scanBody.data.skipped[0].tableNameGuess, 'abc');

  const executeRes = await fetch(`${base}/api/import/folder/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolvedPath: scanBody.data.resolvedPath, matched: scanBody.data.matched, mode: 'append' }),
  });
  const executeBody = await executeRes.json();
  assert.equal(executeRes.status, 200);
  assert.equal(executeBody.ok, true);
  assert.equal(executeBody.data.successCount, 1);
  assert.equal(executeBody.data.failCount, 0);

  const afterFolderImportRes = await fetch(`${base}/api/objects/Person`);
  const afterFolderImportBody = await afterFolderImportRes.json();
  assert.ok(afterFolderImportBody.data.rows.some((r) => r.id === 'p8'), 'file import qua folder phai thay duoc trong bang Person');

  const badFolderScanRes = await fetch(`${base}/api/import/folder/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: path.join(os.tmpdir(), `khong-ton-tai-${Date.now()}`) }),
  });
  const badFolderScanBody = await badFolderScanRes.json();
  assert.equal(badFolderScanRes.status, 400);
  assert.equal(badFolderScanBody.ok, false);

  const exportSchemaRes = await fetch(`${base}/api/export/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: 'MJDL211-e2e', format: 'csv' }),
  });
  const exportSchemaBody = await exportSchemaRes.json();
  assert.equal(exportSchemaRes.status, 200);
  assert.equal(exportSchemaBody.ok, true);
  assert.equal(exportSchemaBody.data.successCount, 2);
  const exportedSchemaDir = exportSchemaBody.data.resolvedDir;
  assert.ok(fs.existsSync(exportedSchemaDir), 'thu muc con phai duoc tao that tren dia');
  fs.rmSync(exportedSchemaDir, { recursive: true, force: true });

  const badExportSchemaFormatRes = await fetch(`${base}/api/export/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: '', format: 'excel' }),
  });
  const badExportSchemaFormatBody = await badExportSchemaFormatRes.json();
  assert.equal(badExportSchemaFormatRes.status, 400);
  assert.equal(badExportSchemaFormatBody.ok, false);

  const wrongOpenRes = await fetch(`${base}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, encryptionKeyHex: '00'.repeat(64) }),
  });
  const wrongOpenBody = await wrongOpenRes.json();
  assert.equal(wrongOpenRes.status, 500);
  assert.equal(wrongOpenBody.ok, false);
  assert.ok(wrongOpenBody.error.length > 0);
});
