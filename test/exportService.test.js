'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const realmService = require('../src/realmService');
const { exportObjects, exportSchema, EXPORT_DIR } = require('../src/exportService');

function cleanupExportedFile(filePath) {
  fs.rmSync(filePath, { force: true });
}

test('exportObjects: CSV - dung header, dung so dong, dung ten file', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(result.filePath));

  assert.match(result.fileName, /^Person_\d{8}_\d{6}\.csv$/);
  assert.equal(path.dirname(result.filePath), EXPORT_DIR);
  assert.equal(result.rowCount, 2);
  assert.ok(fs.existsSync(result.filePath));

  const content = fs.readFileSync(result.filePath, 'utf8');
  const lines = content.trim().split('\r\n');
  assert.equal(lines[0], 'id,name,age,active');
  assert.equal(lines.length, 3); // header + 2 rows
  assert.ok(lines.some((l) => l.includes('Alice')));
  assert.ok(lines.some((l) => l.includes('Bob')));
});

test('exportObjects: CSV escape dung dau phay/nhay kep/xuong dong trong gia tri', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);
  realmService.updateObject('Person', 'p1', { name: 'Alice, "the great"' });

  const result = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(result.filePath));

  const content = fs.readFileSync(result.filePath, 'utf8');
  assert.ok(content.includes('"Alice, ""the great"""'), `expected properly escaped CSV field, got: ${content}`);
});

test('exportObjects: Markdown - dung dinh dang bang, escape dau |', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);
  realmService.updateObject('Note', '0', { title: 'A | B' });

  const result = exportObjects('Note', '', 'markdown');
  t.after(() => cleanupExportedFile(result.filePath));

  assert.match(result.fileName, /^Note_\d{8}_\d{6}\.md$/);
  const content = fs.readFileSync(result.filePath, 'utf8');
  const lines = content.trim().split('\n');
  assert.equal(lines[0], '| title | body |');
  assert.equal(lines[1], '| --- | --- |');
  assert.ok(content.includes('A \\| B'), `expected escaped pipe, got: ${content}`);
});

test('exportObjects: Excel (SpreadsheetML XML) - mo duoc bang Excel, dung so dong', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = exportObjects('Person', '', 'excel');
  t.after(() => cleanupExportedFile(result.filePath));

  assert.match(result.fileName, /^Person_\d{8}_\d{6}\.xls$/);
  const content = fs.readFileSync(result.filePath, 'utf8');
  assert.ok(content.includes('<?mso-application progid="Excel.Sheet"?>'));
  assert.ok(content.includes('urn:schemas-microsoft-com:office:spreadsheet'));
  const rowMatches = content.match(/<Row>/g) || [];
  assert.equal(rowMatches.length, 3); // header row + 2 data rows
  assert.ok(content.includes('<Data ss:Type="Number">30</Data>'), 'numeric field should use ss:Type="Number"');
  assert.ok(content.includes('<Data ss:Type="String">Alice</Data>'));
});

test('exportObjects: filter rong = xuat toan bo, filter khac rong = chi xuat dung phan loc', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const all = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(all.filePath));
  assert.equal(all.rowCount, 2);

  const filtered = exportObjects('Person', 'age > 26', 'csv');
  t.after(() => cleanupExportedFile(filtered.filePath));
  assert.equal(filtered.rowCount, 1);
  const content = fs.readFileSync(filtered.filePath, 'utf8');
  assert.ok(content.includes('Alice'));
  assert.ok(!content.includes('Bob'));
});

test('exportObjects: xuat toan bo du lieu, khong bi gioi han 500 record nhu listObjects thuong', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  // Fixture only has 2 Person rows by default - add more than a typical
  // page size would matter for, to prove export doesn't stop at any cap.
  for (let i = 0; i < 10; i += 1) {
    realmService.createObject('Person', { id: `bulk-${i}`, name: `Bulk ${i}`, age: 20, active: true });
  }
  const result = exportObjects('Person', '', 'csv');
  t.after(() => cleanupExportedFile(result.filePath));
  assert.equal(result.rowCount, 12);
});

test('exportObjects: format khong hop le bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => exportObjects('Person', '', 'pdf'), /không được hỗ trợ/);
});

test('exportObjects: class khong ton tai bao loi ro rang (tai su dung findSchema)', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => exportObjects('NoSuchClass', '', 'csv'), /Không tìm thấy table/);
});

test('exportSchema: export toan bo schema (moi class 1 file) vao thang EXPORT_DIR khi khong nhap ten thu muc', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = exportSchema('', 'csv');
  t.after(() => {
    for (const r of result.results) {
      if (r.ok) fs.rmSync(path.join(result.resolvedDir, r.fileName), { force: true });
    }
  });

  assert.equal(result.resolvedDir, EXPORT_DIR);
  assert.equal(result.successCount, 2);
  assert.equal(result.failCount, 0);
  const personResult = result.results.find((r) => r.className === 'Person');
  assert.equal(personResult.rowCount, 2);
  assert.ok(fs.existsSync(path.join(EXPORT_DIR, personResult.fileName)));
  const noteResult = result.results.find((r) => r.className === 'Note');
  assert.equal(noteResult.rowCount, 2);
});

test('exportSchema: co ten thu muc con -> xuat vao EXPORT_DIR/<ten thu muc>', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = exportSchema('MJDL211', 'markdown');
  t.after(() => fs.rmSync(result.resolvedDir, { recursive: true, force: true }));

  assert.equal(result.resolvedDir, path.join(EXPORT_DIR, 'MJDL211'));
  assert.equal(result.successCount, 2);
  const personResult = result.results.find((r) => r.className === 'Person');
  assert.match(personResult.fileName, /^Person_\d{8}_\d{6}\.md$/);
  assert.ok(fs.existsSync(path.join(result.resolvedDir, personResult.fileName)));
});

test('exportSchema: ten thu muc chua ky tu path traversal bi sanitize, khong thoat khoi EXPORT_DIR', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = exportSchema('../../etc', 'csv');
  t.after(() => fs.rmSync(result.resolvedDir, { recursive: true, force: true }));

  assert.ok(result.resolvedDir.startsWith(EXPORT_DIR), `resolvedDir "${result.resolvedDir}" phai nam trong EXPORT_DIR`);
  assert.ok(!result.resolvedDir.includes('..'), 'khong duoc con dau ".." trong duong dan sau sanitize');
});

test('exportSchema: format excel bi tu choi ro rang (chi ho tro csv/markdown)', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(() => exportSchema('', 'excel'), /không được hỗ trợ khi export toàn bộ schema/);
});
