# Import Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Chính sách commit (CLAUDE.md của project):** KHÔNG tự ý `git commit`.
> Các bước "Commit" dưới đây ghi sẵn message gợi ý để tiện dùng KHI user đã
> yêu cầu rõ commit — người/agent thực thi vẫn phải đợi xác nhận của user
> trước khi thực sự chạy `git commit`, trừ khi user đã nói rõ trong phiên đó
> là được tự commit.

**Goal:** Thêm chế độ Import từ thư mục (bên cạnh Import 1 file hiện có) cho
RealmStudio — quét 1 thư mục chứa nhiều file `.csv`/`.md` đặt tên
`<table>_<yyyymmdd>_<hhmmss>.<ext>`, tự chọn file mới nhất cho mỗi table
khớp với schema `.realm` đang mở, và import hàng loạt.

**Architecture:** Backend thêm 2 hàm thuần trong `importService.js`
(`scanImportFolder`, `executeImportFolder`, tái dùng thẳng `importCsv`/
`importMarkdown` đã có) + 2 route mới trong `routes.js`. Frontend thêm 1
entry point mới ở sidebar-header (không cần chọn table trước) và 1 radio
"Nguồn dữ liệu" (File/Folder) trong modal Import hiện có, với 1 bước
Quét (preview) trước khi Import thật sự.

**Tech Stack:** Node.js/Express (backend đã có), `fs`/`path` chuẩn của
Node (không thêm dependency), vanilla JS/HTML/CSS classic script (frontend
đã có), `node:test` (test đã có).

**Spec:** `docs/superpowers/specs/2026-09-22-import-folder-design.md`
(đọc trước khi bắt đầu — plan này bám sát 100% nội dung spec đó).

---

## Task 1: Backend — `scanImportFolder` (quét thư mục, chọn file mới nhất, khớp table)

**Files:**
- Modify: `src/importService.js`
- Test: `test/importService.test.js`

- [ ] **Step 1: Thêm `require` còn thiếu ở đầu `test/importService.test.js`**

Mở `test/importService.test.js`, sửa các dòng require (dòng 3-9 hiện tại)
thành:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const realmService = require('../src/realmService');
const { exportObjects } = require('../src/exportService');
const {
  importCsv, importMarkdown, parseCsv, parseMarkdownTable,
  scanImportFolder, executeImportFolder,
} = require('../src/importService');
```

- [ ] **Step 2: Thêm helper tạo thư mục import tạm + viết test cho
      `scanImportFolder` (sẽ FAIL vì hàm chưa tồn tại)**

Thêm vào cuối `test/importService.test.js` (sau test cuối cùng
"Round-trip..."):

```js
function makeTempImportDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-dev-tool-import-folder-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

test('scanImportFolder: nhieu file cung table, khac timestamp -> chon file MOI NHAT bat ke duoi csv/md', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const importDir = makeTempImportDir({
    'Person_20260821_003537.md': '| id | name | age | active |\n| --- | --- | --- | --- |\n| p3 | Old | 1 | true |\n',
    'Person_20260921_003537.md': '| id | name | age | active |\n| --- | --- | --- | --- |\n| p3 | Mid | 2 | true |\n',
    'Person_20261021_003537.csv': 'id,name,age,active\np3,New,3,true\n',
  });
  t.after(() => fs.rmSync(importDir, { recursive: true, force: true }));

  const scan = scanImportFolder(importDir);
  assert.equal(scan.resolvedPath, importDir);
  assert.equal(scan.matched.length, 1);
  assert.equal(scan.matched[0].className, 'Person');
  assert.equal(scan.matched[0].fileName, 'Person_20261021_003537.csv');
  assert.equal(scan.matched[0].format, 'csv');
  assert.equal(scan.matched[0].timestamp, '20261021_003537');
  assert.deepEqual(scan.skipped, []);
  assert.equal(scan.ignoredCount, 0);
});

test('scanImportFolder: ten table rut tu file khong khop class nao trong schema -> xep vao skipped, khong loi', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const importDir = makeTempImportDir({
    'abc_20260821_003537.md': '| x |\n| --- |\n| 1 |\n',
  });
  t.after(() => fs.rmSync(importDir, { recursive: true, force: true }));

  const scan = scanImportFolder(importDir);
  assert.deepEqual(scan.matched, []);
  assert.equal(scan.skipped.length, 1);
  assert.equal(scan.skipped[0].tableNameGuess, 'abc');
  assert.equal(scan.skipped[0].fileName, 'abc_20260821_003537.md');
});

test('scanImportFolder: khop table KHONG phan biet hoa/thuong, van dung dung ten class that tu schema', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const importDir = makeTempImportDir({
    'person_20261021_003537.csv': 'id,name,age,active\np3,New,3,true\n',
  });
  t.after(() => fs.rmSync(importDir, { recursive: true, force: true }));

  const scan = scanImportFolder(importDir);
  assert.equal(scan.matched.length, 1);
  assert.equal(scan.matched[0].className, 'Person', 'phai dung dung hoa/thuong cua class that (Person), khong phai "person" tu ten file');
});

test('scanImportFolder: file sai dinh dang ten (khong co timestamp, hoac sai duoi) -> dem vao ignoredCount, khong hien chi tiet', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const importDir = makeTempImportDir({
    'readme.txt': 'khong phai file du lieu',
    'Person.csv': 'id,name,age,active\np3,X,1,true\n', // thieu timestamp -> khong khop pattern
  });
  t.after(() => fs.rmSync(importDir, { recursive: true, force: true }));

  const scan = scanImportFolder(importDir);
  assert.deepEqual(scan.matched, []);
  assert.deepEqual(scan.skipped, []);
  assert.equal(scan.ignoredCount, 2);
});

test('scanImportFolder: thu muc rong -> matched/skipped rong, khong loi', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const importDir = makeTempImportDir({});
  t.after(() => fs.rmSync(importDir, { recursive: true, force: true }));

  const scan = scanImportFolder(importDir);
  assert.deepEqual(scan.matched, []);
  assert.deepEqual(scan.skipped, []);
  assert.equal(scan.ignoredCount, 0);
});

test('scanImportFolder: thu muc khong ton tai -> bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const noSuchDir = path.join(os.tmpdir(), `khong-ton-tai-${Date.now()}`);
  assert.throws(() => scanImportFolder(noSuchDir), /Không đọc được thư mục/);
});

test('scanImportFolder: khong truyen folderPath -> dung mac dinh thu muc "imports" o goc project', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const defaultDir = path.join(__dirname, '..', 'imports');
  fs.mkdirSync(defaultDir, { recursive: true });
  t.after(() => fs.rmSync(defaultDir, { recursive: true, force: true }));

  const scan = scanImportFolder('');
  assert.equal(scan.resolvedPath, defaultDir);
});
```

- [ ] **Step 3: Chạy test để xác nhận FAIL (hàm chưa tồn tại)**

Run: `npm test`
Expected: FAIL — `scanImportFolder is not a function` (hoặc lỗi tương tự) ở
các test vừa thêm; các test cũ vẫn PASS.

- [ ] **Step 4: Cài `scanImportFolder` vào `src/importService.js`**

Thêm `fs`/`path` require ở đầu file (ngay dưới `'use strict';`), và thêm
hàm + export mới ở cuối file. Mở `src/importService.js`:

Sửa các dòng đầu file (dòng 1-4 hiện tại) thành:

```js
'use strict';

const fs = require('fs');
const path = require('path');
const realmService = require('./realmService');
const { toClientSchema, buildWriteValues } = require('./valueConversion');
```

Thêm vào NGAY TRƯỚC dòng `module.exports = { importCsv, importMarkdown, parseCsv, parseMarkdownTable };`
ở cuối file:

```js
const DEFAULT_IMPORT_DIR = path.join(__dirname, '..', 'imports');

// <tenTable>_<yyyymmdd>_<hhmmss>.<csv|md> - dung quy uoc exportService.js
// dung khi Export (xem timestampForFilename trong exportService.js). Nhom 1
// = ten table ung vien, nhom 2+3 ghep lai = khoa sap xep thoi gian.
const FOLDER_FILE_PATTERN = /^(.+)_(\d{8})_(\d{6})\.(csv|md)$/i;

function resolveImportFolderPath(folderPath) {
  const trimmed = (folderPath || '').trim();
  if (!trimmed) return DEFAULT_IMPORT_DIR;
  return path.isAbsolute(trimmed) ? trimmed : path.join(__dirname, '..', trimmed);
}

function extToFormat(ext) {
  return ext.toLowerCase() === 'md' ? 'markdown' : 'csv';
}

// Quet 1 thu muc (KHONG de quy vao thu muc con, bo qua file an bat dau bang
// '.'), doi chieu ten file voi schema Realm dang mo, chon ra file MOI NHAT
// cho moi table (khong phan biet duoi csv/md). Table rut ra tu ten file
// nhung khong khop class nao trong schema -> xep vao skipped (khong loi).
// File khong dung quy uoc dat ten -> dem vao ignoredCount, khong hien chi
// tiet tung file.
function scanImportFolder(folderPath) {
  const resolvedPath = resolveImportFolderPath(folderPath);

  let entries;
  try {
    entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
  } catch (e) {
    const err = new Error(`Không đọc được thư mục "${resolvedPath}": ${e.message}`);
    err.statusCode = 400;
    throw err;
  }

  const schema = realmService.getSchema();
  const schemaByLowerName = new Map(schema.map((s) => [s.name.toLowerCase(), s.name]));

  const matchedByLowerName = new Map();
  const skippedByLowerName = new Map();
  let ignoredCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const match = FOLDER_FILE_PATTERN.exec(entry.name);
    if (!match) {
      ignoredCount += 1;
      continue;
    }
    const [, tableNameGuess, dateStr, timeStr, extRaw] = match;
    const timestampKey = `${dateStr}${timeStr}`; // 14 ky tu so, sap chuoi = sap thoi gian
    const timestamp = `${dateStr}_${timeStr}`;
    const format = extToFormat(extRaw);
    const lowerName = tableNameGuess.toLowerCase();
    const className = schemaByLowerName.get(lowerName);

    if (!className) {
      const existing = skippedByLowerName.get(lowerName);
      if (!existing || timestampKey > existing.timestampKey) {
        skippedByLowerName.set(lowerName, { tableNameGuess, fileName: entry.name, timestamp, timestampKey });
      }
      continue;
    }

    const existing = matchedByLowerName.get(lowerName);
    if (!existing || timestampKey > existing.timestampKey) {
      matchedByLowerName.set(lowerName, { className, fileName: entry.name, format, timestamp, timestampKey });
    }
  }

  const matched = Array.from(matchedByLowerName.values())
    .map(({ className, fileName, format, timestamp }) => ({ className, fileName, format, timestamp }))
    .sort((a, b) => a.className.localeCompare(b.className));
  const skipped = Array.from(skippedByLowerName.values())
    .map(({ tableNameGuess, fileName, timestamp }) => ({ tableNameGuess, fileName, timestamp }))
    .sort((a, b) => a.tableNameGuess.localeCompare(b.tableNameGuess));

  return { resolvedPath, matched, skipped, ignoredCount };
}
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS toàn bộ, kể cả 7 test `scanImportFolder` vừa thêm (các test
`executeImportFolder` ở Task 2 sẽ vẫn FAIL ở bước này — bình thường, xử lý
ở Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/importService.js test/importService.test.js
git commit -m "feat(import): add scanImportFolder to match latest csv/md per table in a folder"
```

## Task 2: Backend — `executeImportFolder` (import hàng loạt, 1 table lỗi không chặn các table khác)

**Files:**
- Modify: `src/importService.js`
- Test: `test/importService.test.js`

- [ ] **Step 1: Viết test cho `executeImportFolder` (sẽ FAIL vì hàm chưa tồn tại)**

Thêm vào cuối `test/importService.test.js`:

```js
test('executeImportFolder: import nhieu table cung luc thanh cong', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const importDir = makeTempImportDir({
    'Person_20261021_003537.csv': 'id,name,age,active\np9,Zed,50,true\n',
    'Note_20261021_003537.md': '| title | body |\n| --- | --- |\n| Hi | There |\n',
  });
  t.after(() => fs.rmSync(importDir, { recursive: true, force: true }));

  const scan = scanImportFolder(importDir);
  assert.equal(scan.matched.length, 2);

  const result = executeImportFolder(scan.resolvedPath, scan.matched, 'append');
  assert.equal(result.successCount, 2);
  assert.equal(result.failCount, 0);
  const personResult = result.results.find((r) => r.className === 'Person');
  assert.equal(personResult.ok, true);
  assert.equal(personResult.insertedCount, 1);
  const noteResult = result.results.find((r) => r.className === 'Note');
  assert.equal(noteResult.ok, true);
  assert.equal(noteResult.insertedCount, 1);

  assert.ok(realmService.listObjects('Person', '').rows.some((r) => r.id === 'p9'));
  assert.ok(realmService.listObjects('Note', '').rows.some((r) => r.title === 'Hi'));
});

test('executeImportFolder: 1 table loi (class khong ton tai) khong chan cac table con lai', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const importDir = makeTempImportDir({
    'Person_20261021_003537.csv': 'id,name,age,active\np9,Zed,50,true\n',
  });
  t.after(() => fs.rmSync(importDir, { recursive: true, force: true }));

  const matched = [
    { className: 'Person', fileName: 'Person_20261021_003537.csv', format: 'csv' },
    { className: 'KhongTonTai', fileName: 'Person_20261021_003537.csv', format: 'csv' },
  ];
  const result = executeImportFolder(importDir, matched, 'append');
  assert.equal(result.successCount, 1);
  assert.equal(result.failCount, 1);
  const okResult = result.results.find((r) => r.className === 'Person');
  assert.equal(okResult.ok, true);
  const badResult = result.results.find((r) => r.className === 'KhongTonTai');
  assert.equal(badResult.ok, false);
  assert.match(badResult.error, /Không tìm thấy table/);
});

test('executeImportFolder: mode khong hop le hoac danh sach matched rong -> bao loi ro rang', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  assert.throws(
    () => executeImportFolder('/tmp', [{ className: 'Person', fileName: 'x.csv', format: 'csv' }], 'merge'),
    /không hợp lệ/
  );
  assert.throws(() => executeImportFolder('/tmp', [], 'append'), /Không có table/);
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL — `executeImportFolder is not a function` ở 3 test vừa
thêm; mọi test khác (kể cả `scanImportFolder` ở Task 1) vẫn PASS.

- [ ] **Step 3: Cài `executeImportFolder` vào `src/importService.js`**

Thêm vào NGAY SAU hàm `scanImportFolder` (trước dòng `module.exports`):

```js
const FOLDER_IMPORT_HANDLERS = { csv: importCsv, markdown: importMarkdown };

// Doc lai TUNG file trong `matched` (dung danh sach client da preview tu
// scanImportFolder) roi import qua importCsv/importMarkdown nhu cu. 1 table
// loi KHONG chan cac table con lai - gom ket qua tung table vao `results`.
function executeImportFolder(resolvedPath, matched, mode) {
  if (!VALID_MODES.has(mode)) {
    const err = new Error(`Chế độ import "${mode}" không hợp lệ. Chỉ hỗ trợ: overwrite, append.`);
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(matched) || matched.length === 0) {
    const err = new Error('Không có table nào để import.');
    err.statusCode = 400;
    throw err;
  }

  const results = [];
  for (const item of matched) {
    const { className, fileName, format } = item;
    try {
      const filePath = path.join(resolvedPath, fileName);
      const content = fs.readFileSync(filePath, 'utf8');
      const importFn = FOLDER_IMPORT_HANDLERS[format];
      if (!importFn) {
        throw new Error(`Format "${format}" không được hỗ trợ.`);
      }
      const result = importFn(className, content, mode);
      results.push({ className, fileName, ok: true, ...result });
    } catch (e) {
      results.push({ className, fileName, ok: false, error: e.message });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return { results, successCount, failCount: results.length - successCount };
}
```

Sửa dòng `module.exports` cuối file thành:

```js
module.exports = {
  importCsv, importMarkdown, parseCsv, parseMarkdownTable,
  scanImportFolder, executeImportFolder,
};
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS toàn bộ (10 test mới ở Task 1+2, cộng toàn bộ test cũ).

- [ ] **Step 5: Commit**

```bash
git add src/importService.js test/importService.test.js
git commit -m "feat(import): add executeImportFolder, per-table error isolation"
```

## Task 3: Backend — HTTP routes + e2e test

**Files:**
- Modify: `src/routes.js`
- Test: `test/e2e.test.js`

- [ ] **Step 1: Viết e2e test cho 2 route mới (sẽ FAIL vì route chưa tồn tại)**

Mở `test/e2e.test.js`, thêm `const os = require('os');` vào sau dòng
`const path = require('path');` (dòng 6 hiện tại).

Thêm đoạn sau vào NGAY TRƯỚC khối `const wrongOpenRes = ...` gần cuối file
(trước dòng 149 hiện tại):

```js
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

```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL ở `test/e2e.test.js` — route `/api/import/folder/scan` trả
404 hoặc lỗi tương tự (route chưa tồn tại); các file test khác vẫn PASS.

- [ ] **Step 3: Thêm 2 route vào `src/routes.js`**

Thêm vào NGAY TRƯỚC dòng `router.post('/objects/:className', ...)` (dòng
71 hiện tại):

```js
router.post('/import/folder/scan', handle(async (req) => {
  const { folderPath } = req.body || {};
  return importService.scanImportFolder(folderPath);
}));

router.post('/import/folder/execute', handle(async (req) => {
  const { resolvedPath, matched, mode } = req.body || {};
  return importService.executeImportFolder(resolvedPath, matched, mode);
}));

```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS toàn bộ (backend hoàn chỉnh tới đây).

- [ ] **Step 5: Commit**

```bash
git add src/routes.js test/e2e.test.js
git commit -m "feat(import): wire POST /api/import/folder/scan and /execute routes"
```

## Task 4: `.gitignore` — thêm thư mục `imports/`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Thêm dòng `imports/`**

Sửa `.gitignore` (nội dung hiện tại 7 dòng: `node_modules/`, `*.realm`,
`*.realm.lock`, `*.realm.management/`, `.DS_Store`, `logs/`, `exports/`),
thêm 1 dòng mới sau `exports/`:

```
node_modules/
*.realm
*.realm.lock
*.realm.management/
.DS_Store
logs/
exports/
imports/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore the local imports/ folder"
```

## Task 5: Frontend — markup + CSS (sidebar button, radio nguồn dữ liệu, khối Folder, preview list, kết quả)

**Files:**
- Modify: `public/index.html`
- Modify: `public/style.css`

- [ ] **Step 1: Thêm icon-button "Import từ thư mục" vào `#sidebar-header`**

Trong `public/index.html`, tìm khối (dòng 34-37 hiện tại):

```html
      <div id="sidebar-header">
        <button type="button" id="toggle-sidebar" class="icon-btn" title="Thu gọn/mở rộng danh sách table">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
```

Thêm ngay sau `</button>` của `toggle-sidebar`, TRƯỚC `<div class="search-wrap">`:

```html
        <button type="button" id="open-import-folder" class="icon-btn icon-btn-import" title="Import từ thư mục (không cần chọn table trước)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>
```

- [ ] **Step 2: Sửa lại khối `#import-overlay`**

Thay TOÀN BỘ khối `<div id="import-overlay" hidden>...</div>` hiện có
(dòng 114-141) bằng:

```html
  <div id="import-overlay" hidden>
    <div class="dialog-card">
      <h2>Import dữ liệu</h2>
      <div class="field">
        <label class="field-title">Nguồn dữ liệu</label>
        <label class="radio-option">
          <input type="radio" name="import-source" id="import-source-file" value="file" checked />
          1 file
        </label>
        <label class="radio-option">
          <input type="radio" name="import-source" id="import-source-folder" value="folder" />
          Thư mục (import nhiều table cùng lúc)
        </label>
      </div>
      <div class="field" id="import-file-block">
        <label class="field-title">File dữ liệu <span class="field-hint">(.csv hoặc .md - tự nhận diện định dạng theo đuôi file)</span></label>
        <div class="file-picker">
          <button type="button" id="import-browse" class="btn btn-ghost">Chọn file...</button>
          <span id="import-file-name" class="file-picker-name">Chưa chọn file</span>
        </div>
        <input type="file" id="import-file-input" accept=".csv,.md,text/csv,text/markdown" hidden />
      </div>
      <div class="field" id="import-folder-block" hidden>
        <label class="field-title" for="import-folder-path">Đường dẫn thư mục <span class="field-hint">(để trống = dùng thư mục "imports" mặc định)</span></label>
        <div class="file-picker">
          <input type="text" id="import-folder-path" placeholder="imports (mặc định)" autocomplete="off" />
          <button type="button" id="import-folder-scan" class="btn btn-ghost">Quét</button>
        </div>
        <div id="import-folder-preview" class="import-folder-preview" hidden></div>
      </div>
      <div class="field">
        <label class="field-title">Chế độ</label>
        <label class="radio-option">
          <input type="radio" name="import-mode" id="import-mode-append" value="append" checked />
          Thêm mới (giữ dữ liệu hiện có, thêm dữ liệu từ file)
        </label>
        <label class="radio-option">
          <input type="radio" name="import-mode" id="import-mode-overwrite" value="overwrite" />
          Ghi đè (xoá toàn bộ dữ liệu hiện có, thay bằng dữ liệu từ file)
        </label>
      </div>
      <div class="edit-actions">
        <button type="button" id="import-cancel" class="btn btn-ghost">Hủy</button>
        <button type="button" id="import-confirm" class="btn btn-primary">Import</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Thêm CSS cho nút mới + khối Folder + preview/kết quả**

Thêm vào cuối `public/style.css`:

```css
/* ---------- Import folder (thêm entry point sidebar + preview) ---------- */
.icon-btn-import { color: var(--import); }
.icon-btn-import:hover { background: var(--import-soft); border-color: var(--import); box-shadow: 0 0 10px var(--import-border); }

.file-picker input[type="text"] { flex: 1; min-width: 0; }

.import-folder-preview {
  margin-top: 10px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 12px;
}
.import-folder-preview h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  margin: 10px 0 4px;
}
.import-folder-preview h3:first-child { margin-top: 0; }
.import-folder-preview-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.import-folder-preview-row .table-name { color: var(--text); font-weight: 500; }
.import-folder-preview-row .file-name {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.import-folder-preview-empty { color: var(--text-muted); padding: 6px 0; }
.import-folder-preview-note { color: var(--text-muted); font-size: 11px; margin-top: 8px; }
.import-folder-result-row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; }
.import-folder-result-row.ok .table-name { color: var(--success); }
.import-folder-result-row.fail .table-name { color: var(--danger); }
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat(import): add folder-import markup + styling in the import modal"
```

## Task 6: Frontend — logic quét/preview/import trong `importExport.js`

**Files:**
- Modify: `public/js/importExport.js`

- [ ] **Step 1: Thêm state + hằng số cho radio nguồn dữ liệu**

Trong `public/js/importExport.js`, ngay sau dòng
`const IMPORT_MODE_IDS = { append: 'import-mode-append', overwrite: 'import-mode-overwrite' };`
(dòng 51 hiện tại), thêm:

```js
const IMPORT_SOURCE_IDS = { file: 'import-source-file', folder: 'import-source-folder' };

// Ket qua lan Quet gan nhat (null = chua Quet, hoac da bi invalidate do doi
// duong dan/nguon sau khi Quet). import-confirm o che do Folder chi bat khi
// bien nay khac null va co it nhat 1 table matched.
let folderScanResult = null;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderImportFolderPreview() {
  const container = el('import-folder-preview');
  if (!folderScanResult) {
    // Chi goi nhanh nay tu catch cua import-folder-scan (quet that bai) -
    // khong co ket qua hop le nao de import, nen luon disable.
    container.hidden = true;
    container.innerHTML = '';
    el('import-confirm').disabled = true;
    return;
  }
  const { matched, skipped, ignoredCount } = folderScanResult;
  const parts = [];
  parts.push(`<h3>Sẽ import (${matched.length})</h3>`);
  if (matched.length === 0) {
    parts.push('<div class="import-folder-preview-empty">Không có table nào để import.</div>');
  } else {
    for (const m of matched) {
      parts.push(`<div class="import-folder-preview-row"><span class="table-name">${escapeHtml(m.className)}</span><span class="file-name">${escapeHtml(m.fileName)}</span></div>`);
    }
  }
  if (skipped.length > 0) {
    parts.push(`<h3>Bỏ qua - không có table (${skipped.length})</h3>`);
    for (const s of skipped) {
      parts.push(`<div class="import-folder-preview-row"><span class="table-name">${escapeHtml(s.tableNameGuess)}</span><span class="file-name">${escapeHtml(s.fileName)}</span></div>`);
    }
  }
  if (ignoredCount > 0) {
    parts.push(`<div class="import-folder-preview-note">${ignoredCount} file khác không đúng định dạng tên, đã bỏ qua.</div>`);
  }
  container.innerHTML = parts.join('');
  container.hidden = false;
  el('import-confirm').disabled = matched.length === 0;
}

function invalidateFolderScan() {
  folderScanResult = null;
  el('import-folder-preview').hidden = true;
  el('import-folder-preview').innerHTML = '';
  if (getCheckedRadioValue(IMPORT_SOURCE_IDS, 'file') === 'folder') {
    el('import-confirm').disabled = true;
  }
}

function applyImportSourceVisibility() {
  const source = getCheckedRadioValue(IMPORT_SOURCE_IDS, 'file');
  el('import-file-block').hidden = source !== 'file';
  el('import-folder-block').hidden = source !== 'folder';
  el('import-confirm').disabled = source === 'folder' && !(folderScanResult && folderScanResult.matched.length > 0);
}

document.querySelectorAll('input[name="import-source"]').forEach((radio) => {
  radio.addEventListener('change', applyImportSourceVisibility);
});

el('import-folder-path').addEventListener('input', invalidateFolderScan);

el('import-folder-scan').addEventListener('click', async () => {
  const btn = el('import-folder-scan');
  btn.disabled = true;
  try {
    const folderPath = el('import-folder-path').value.trim();
    folderScanResult = await api('POST', '/api/import/folder/scan', { folderPath });
    renderImportFolderPreview();
  } catch (err) {
    folderScanResult = null;
    renderImportFolderPreview();
    showError(`Quét thư mục thất bại: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});
```

- [ ] **Step 2: Mở modal ở đúng chế độ tuỳ entry point**

Sửa handler `el('import-data').addEventListener('click', ...)` hiện tại
(dòng 101-111) — thêm 1 dòng set radio File = checked, và reset thêm state
Folder mới, thành:

```js
el('import-data').addEventListener('click', () => {
  if (!state.currentClass) return;
  importFileContent = null;
  importFileName = '';
  importFileFormat = 'csv';
  el('import-file-name').textContent = 'Chưa chọn file';
  el('import-file-input').value = ''; // để chọn lại đúng file cũ vẫn bắn 'change'
  el(IMPORT_MODE_IDS.append).checked = true;
  el(IMPORT_MODE_IDS.overwrite).checked = false;
  el(IMPORT_SOURCE_IDS.file).checked = true;
  el('import-folder-path').value = '';
  invalidateFolderScan();
  applyImportSourceVisibility();
  el('import-overlay').hidden = false;
});

el('open-import-folder').addEventListener('click', () => {
  el(IMPORT_MODE_IDS.append).checked = true;
  el(IMPORT_MODE_IDS.overwrite).checked = false;
  el(IMPORT_SOURCE_IDS.folder).checked = true;
  el('import-folder-path').value = '';
  invalidateFolderScan();
  applyImportSourceVisibility();
  el('import-overlay').hidden = false;
});
```

- [ ] **Step 3: Rẽ nhánh `import-confirm` theo nguồn dữ liệu**

Sửa handler `el('import-confirm').addEventListener('click', ...)` hiện có
(dòng 121-165) — bọc toàn bộ nội dung CŨ (logic file, không đổi) vào
nhánh `if (source === 'file') { ... }`, thêm nhánh `else` mới cho folder.
Thay toàn bộ handler hiện tại bằng:

```js
el('import-confirm').addEventListener('click', async () => {
  const source = getCheckedRadioValue(IMPORT_SOURCE_IDS, 'file');
  const mode = getCheckedRadioValue(IMPORT_MODE_IDS, 'append');

  if (source === 'file') {
    if (!importFileContent) {
      showError('Vui lòng chọn file cần import.');
      return;
    }
    const format = importFileFormat;
    const nameMismatch = !fileNameMatchesTable(importFileName, state.currentClass);
    const mismatchWarning = nameMismatch
      ? `Tên file "${importFileName}" có vẻ KHÔNG khớp với table "${state.currentClass}" đang chọn. Vui lòng kiểm tra lại đúng file trước khi tiếp tục.`
      : '';
    if (mode === 'overwrite') {
      let message = `"Ghi đè" sẽ XÓA TOÀN BỘ dữ liệu hiện có trong table "${state.currentClass}" trước khi import từ file. Bạn có chắc chắn muốn tiếp tục?`;
      if (mismatchWarning) message += `\n\n${mismatchWarning}`;
      const confirmed = await showConfirm(message);
      if (!confirmed) return;
    } else if (mismatchWarning) {
      const confirmed = await showConfirm(`${mismatchWarning}\n\nBạn có chắc chắn muốn tiếp tục import không?`);
      if (!confirmed) return;
    }
    const btn = el('import-confirm');
    btn.disabled = true;
    try {
      const result = await api('POST', `/api/objects/${encodeURIComponent(state.currentClass)}/import`, { content: importFileContent, mode, format });
      el('import-overlay').hidden = true;
      await loadObjects();
      refreshOneClassCount(state.currentClass);
      const modeLabel = mode === 'overwrite' ? 'Ghi đè' : 'Thêm mới';
      const skippedNote = result.skippedColumns.length
        ? ` Đã bỏ qua ${result.skippedColumns.length} cột không có trong table: ${result.skippedColumns.join(', ')}.`
        : '';
      showToast(`Đã import ${result.insertedCount} record vào table "${state.currentClass}" (chế độ: ${modeLabel}).${skippedNote}`);
    } catch (err) {
      showError(`Import thất bại: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
    return;
  }

  // source === 'folder'
  if (!folderScanResult || folderScanResult.matched.length === 0) {
    showError('Vui lòng Quét thư mục và đảm bảo có ít nhất 1 table sẽ import.');
    return;
  }
  const tableNames = folderScanResult.matched.map((m) => m.className);
  if (mode === 'overwrite') {
    const message = `"Ghi đè" sẽ XÓA TOÀN BỘ dữ liệu hiện có trong ${tableNames.length} table sau trước khi import: ${tableNames.join(', ')}. Bạn có chắc chắn muốn tiếp tục?`;
    const confirmed = await showConfirm(message);
    if (!confirmed) return;
  }
  const btn = el('import-confirm');
  btn.disabled = true;
  try {
    const execResult = await api('POST', '/api/import/folder/execute', {
      resolvedPath: folderScanResult.resolvedPath,
      matched: folderScanResult.matched,
      mode,
    });
    const rows = execResult.results.map((r) => {
      const status = r.ok
        ? `<span class="table-name">✓ ${r.insertedCount} record</span>`
        : `<span class="table-name">✗ ${escapeHtml(r.error)}</span>`;
      return `<div class="import-folder-result-row ${r.ok ? 'ok' : 'fail'}"><span class="table-name">${escapeHtml(r.className)}</span>${status}</div>`;
    });
    el('import-folder-preview').innerHTML = `<h3>Kết quả (${execResult.successCount} thành công / ${execResult.failCount} lỗi)</h3>${rows.join('')}`;
    el('import-folder-preview').hidden = false;
    folderScanResult = null;
    el('import-confirm').disabled = true;

    await loadClassCounts(state.schema);
    if (tableNames.includes(state.currentClass)) {
      await loadObjects();
    }
    const modeLabel = mode === 'overwrite' ? 'Ghi đè' : 'Thêm mới';
    showToast(`Đã import ${execResult.successCount}/${tableNames.length} table (chế độ: ${modeLabel}).`);
  } catch (err) {
    showError(`Import thất bại: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});
```

- [ ] **Step 4: Xác nhận không còn tham chiếu trùng lặp**

Đọc lại toàn bộ `public/js/importExport.js`, xác nhận:
- Chỉ có DUY NHẤT 1 khai báo `el('import-confirm').addEventListener('click', ...)`.
- Chỉ có DUY NHẤT 1 khai báo `el('import-data').addEventListener('click', ...)`.
- `IMPORT_SOURCE_IDS`, `folderScanResult`, `escapeHtml`, `renderImportFolderPreview`,
  `invalidateFolderScan`, `applyImportSourceVisibility` mỗi cái khai báo đúng 1 lần.

Sửa lại nếu phát hiện trùng lặp (thường do chép nhầm khi thay thế khối cũ).

- [ ] **Step 5: Commit**

```bash
git add public/js/importExport.js
git commit -m "feat(import): wire folder-import scan/preview/execute flow"
```

## Task 7: Verify toàn bộ (backend test suite + kiểm tra frontend thủ công)

**Files:** không tạo file mới trong repo (script verify là file tạm, KHÔNG
commit — theo đúng mục "Cách verify khi sửa frontend" trong CLAUDE.md).

- [ ] **Step 1: Chạy lại toàn bộ test suite backend**

Run: `npm test`
Expected: PASS toàn bộ (test cũ + 10 test mới ở Task 1/2 + phần bổ sung ở
Task 3).

- [ ] **Step 2: Viết script verify frontend tạm (KHÔNG commit)**

Trong scratchpad directory, viết 1 script Node dùng `vm.createContext()` +
mock DOM tối thiểu (theo đúng kỹ thuật mô tả trong mục "Cách verify khi sửa
frontend" của `CLAUDE.md`), load 8 file `public/js/*.js` theo đúng thứ tự
trong `index.html`, chạy `createApp()` + `buildFixtureRealm()` thật trên 1
port ephemeral, rồi lần lượt:

1. Gọi `openConnection(filePath, encryptionKeyHex)`.
2. Dispatch click vào `open-import-folder` — assert `import-source-folder`
   đang checked, `import-folder-block` không `hidden`, `import-file-block`
   có `hidden`.
3. Tạo 1 thư mục tạm chứa 2 file (`Person_<timestamp>.csv` khớp table
   `Person`, và `abc_<timestamp>.md` không khớp table nào) — set giá trị
   `import-folder-path` = đường dẫn thư mục đó, dispatch click
   `import-folder-scan`, `await` xong assert `import-folder-preview` không
   còn `hidden` và có đúng 1 dòng matched (`Person`) + 1 dòng skipped
   (`abc`), `import-confirm.disabled === false`.
4. Sửa giá trị `import-folder-path` (dispatch sự kiện `input`), assert
   `import-confirm.disabled === true` và preview bị ẩn lại (đúng hành vi
   invalidate).
5. Set lại đúng path cũ, quét lại, dispatch click `import-confirm`, `await`
   xong assert bảng `Person` (qua `state.rows`/gọi API count) có thêm
   record mới.
6. Gọi `process.exit(0)` ở cuối script (bắt buộc — xem CLAUDE.md, `realm-js`
   giữ process sống).

Chạy script, xác nhận toàn bộ assert PASS. Sau khi xác nhận PASS, XÓA
script tạm — không commit (đúng invariant trong CLAUDE.md).

- [ ] **Step 3: Nhắc user restart thủ công**

Không có hot reload — nếu user đang có `npm start` chạy sẵn để tự tay thử,
nhắc họ dừng (Ctrl+C) và chạy lại `npm start`, F5 trang.

---

## Ghi chú tổng kết cho người thực thi

- Task 1-4 hoàn toàn độc lập với frontend — có thể review/chạy test ngay
  sau mỗi task mà không cần đợi các task frontend.
- Task 5-6 phụ thuộc route đã có ở Task 3 (import-folder-scan/execute) để
  test thủ công qua UI, nhưng markup/CSS (Task 5) và logic JS (Task 6) tự
  nó không phụ thuộc thứ tự — có thể làm Task 5 trước hoặc sau Task 1-4 nếu
  muốn, miễn Task 6 luôn sau Task 5 (JS cần các id DOM Task 5 tạo ra) và
  sau Task 3 (JS gọi API Task 3 tạo ra).
- Không đổi hành vi Import 1 file hiện có ở bất kỳ task nào — mọi test cũ
  trong `test/importService.test.js` và `test/e2e.test.js` phải tiếp tục
  PASS nguyên trạng sau Task 1-3.
