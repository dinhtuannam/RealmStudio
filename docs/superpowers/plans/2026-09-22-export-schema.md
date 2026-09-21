# Export Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Chính sách commit (CLAUDE.md của project):** KHÔNG tự ý `git commit` trừ
> khi user đã yêu cầu rõ trong phiên đó.

**Goal:** Thêm chế độ Export toàn bộ schema (bên cạnh Export 1 table hiện
có) cho RealmStudio — export mọi table trong schema `.realm` đang mở vào
`exports/` hoặc 1 thư mục con user tự đặt tên, format CSV hoặc Markdown.

**Architecture:** Tách `exportObjects` hiện có thành 1 hàm dùng chung
`exportObjectsToDir(targetDir, ...)` + hàm mới `exportSchema(folder, format)`
lặp qua schema gọi hàm chung đó, cô lập lỗi từng table. Frontend tách lại
`#sidebar-header` thành 2 hàng, thêm 1 entry point mới + 1 radio "Phạm vi"
trong modal Export hiện có (mirror đúng pattern Import folder).

**Tech Stack:** Node.js/Express, `fs`/`path` chuẩn (không thêm dependency),
vanilla JS/HTML/CSS, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-22-export-schema-design.md` (đọc
trước khi bắt đầu).

---

## Task 1: Backend — tách `exportObjectsToDir` + thêm `exportSchema`

**Files:**
- Modify: `src/exportService.js`
- Test: `test/exportService.test.js`

- [ ] **Step 1: Cập nhật require ở đầu test file**

Sửa dòng 9 hiện tại của `test/exportService.test.js` thành:

```js
const { exportObjects, exportSchema, EXPORT_DIR } = require('../src/exportService');
```

- [ ] **Step 2: Viết test cho `exportSchema` (sẽ FAIL vì hàm chưa tồn tại)**

Thêm vào cuối `test/exportService.test.js`:

```js
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
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL — `exportSchema is not a function` ở 4 test vừa thêm; mọi
test khác (kể cả `exportObjects` cũ) vẫn PASS.

- [ ] **Step 4: Cài `exportObjectsToDir` + `exportSchema` vào `src/exportService.js`**

Thay hàm `exportObjects` hiện tại (đoạn dưới đây, giữ nguyên các hàm khác
phía trên nó trong file không đổi):

```js
function exportObjects(className, filter, format) {
  const handler = FORMAT_HANDLERS[format];
  if (!handler) {
    const err = new Error(`Format "${format}" không được hỗ trợ. Chỉ hỗ trợ: csv, excel, markdown.`);
    err.statusCode = 400;
    throw err;
  }
  // limit: Infinity bypasses listObjects' normal MAX_RESULTS page cap -
  // export must include every matching record, not just the first page.
  const { rows, schema } = realmService.listObjects(className, filter, 0, Infinity);
  const content = handler.build(schema.properties, rows);

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const fileName = `${sanitizeForFilename(className)}_${timestampForFilename(new Date())}.${handler.ext}`;
  const filePath = path.join(EXPORT_DIR, fileName);
  fs.writeFileSync(filePath, content, 'utf8');

  return { fileName, filePath, rowCount: rows.length };
}

module.exports = { exportObjects, EXPORT_DIR };
```

bằng:

```js
// Ham dung chung, nhan targetDir tuong minh - exportObjects() (export 1
// table, luon ghi vao EXPORT_DIR) va exportSchema() (export ca schema, co
// the ghi vao 1 thu muc con) deu goi qua day, tranh trung logic build
// content/tao ten file.
function exportObjectsToDir(targetDir, className, filter, format) {
  const handler = FORMAT_HANDLERS[format];
  if (!handler) {
    const err = new Error(`Format "${format}" không được hỗ trợ. Chỉ hỗ trợ: csv, excel, markdown.`);
    err.statusCode = 400;
    throw err;
  }
  // limit: Infinity bypasses listObjects' normal MAX_RESULTS page cap -
  // export must include every matching record, not just the first page.
  const { rows, schema } = realmService.listObjects(className, filter, 0, Infinity);
  const content = handler.build(schema.properties, rows);

  fs.mkdirSync(targetDir, { recursive: true });
  const fileName = `${sanitizeForFilename(className)}_${timestampForFilename(new Date())}.${handler.ext}`;
  const filePath = path.join(targetDir, fileName);
  fs.writeFileSync(filePath, content, 'utf8');

  return { fileName, filePath, rowCount: rows.length };
}

function exportObjects(className, filter, format) {
  return exportObjectsToDir(EXPORT_DIR, className, filter, format);
}

const SCHEMA_EXPORT_FORMATS = new Set(['csv', 'markdown']);

// Export TAT CA table trong schema dang mo, moi table 1 file, vao
// EXPORT_DIR (folderName rong) hoac EXPORT_DIR/<folderName> (co nhap).
// sanitizeForFilename() da thay moi ky tu ngoai [a-zA-Z0-9_-] (gom ca '/',
// '\', '.') thanh '_' nen tu dong triet tieu path traversal, khong can
// logic rieng. 1 table loi khong chan cac table con lai.
function exportSchema(folderName, format) {
  if (!SCHEMA_EXPORT_FORMATS.has(format)) {
    const err = new Error(`Format "${format}" không được hỗ trợ khi export toàn bộ schema. Chỉ hỗ trợ: csv, markdown.`);
    err.statusCode = 400;
    throw err;
  }
  const trimmed = (folderName || '').trim();
  const resolvedDir = trimmed ? path.join(EXPORT_DIR, sanitizeForFilename(trimmed)) : EXPORT_DIR;

  const schema = realmService.getSchema();
  const results = [];
  for (const cls of schema) {
    try {
      const { fileName, rowCount } = exportObjectsToDir(resolvedDir, cls.name, '', format);
      results.push({ className: cls.name, fileName, rowCount, ok: true });
    } catch (e) {
      results.push({ className: cls.name, ok: false, error: e.message });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return { resolvedDir, results, successCount, failCount: results.length - successCount };
}

module.exports = { exportObjects, exportSchema, EXPORT_DIR };
```

- [ ] **Step 5: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS toàn bộ, kể cả 4 test `exportSchema` mới VÀ toàn bộ 8 test
`exportObjects` cũ (xác nhận refactor không đổi hành vi cũ).

- [ ] **Step 6: Commit**

```bash
git add src/exportService.js test/exportService.test.js
git commit -m "feat(export): add exportSchema - export every table to exports/ or a named subfolder"
```

## Task 2: Backend — HTTP route + e2e test

**Files:**
- Modify: `src/routes.js`
- Test: `test/e2e.test.js`

- [ ] **Step 1: Viết e2e test (sẽ FAIL vì route chưa tồn tại)**

Thêm vào `test/e2e.test.js`, NGAY TRƯỚC khối `const wrongOpenRes = ...`
(dòng 192 hiện tại):

```js
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

```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL ở `test/e2e.test.js` (route chưa tồn tại → JSON parse lỗi
hoặc 404); test khác vẫn PASS.

- [ ] **Step 3: Thêm route vào `src/routes.js`**

Thêm vào NGAY SAU khối `router.post('/import/folder/execute', ...)` (2
route Import folder đã có từ trước) và TRƯỚC
`router.post('/objects/:className', ...)`:

```js
router.post('/export/schema', handle(async (req) => {
  const { folder, format } = req.body || {};
  return exportService.exportSchema(folder, format);
}));

```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/routes.js test/e2e.test.js
git commit -m "feat(export): wire POST /api/export/schema route"
```

## Task 3: Frontend — markup + CSS (tách sidebar-header 2 hàng, nút mới, modal Export mở rộng)

**Files:**
- Modify: `public/index.html`
- Modify: `public/style.css`

- [ ] **Step 1: Tách `#sidebar-header` thành 2 hàng + thêm nút Export toàn bộ schema**

Trong `public/index.html`, thay khối (dòng 35-46 hiện tại):

```html
      <div id="sidebar-header">
        <button type="button" id="toggle-sidebar" class="icon-btn" title="Thu gọn/mở rộng danh sách table">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <button type="button" id="open-import-folder" class="icon-btn icon-btn-import" title="Import từ thư mục (không cần chọn table trước)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>
        <div class="search-wrap">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="class-search" placeholder="Tìm table theo tên..." autocomplete="off" />
        </div>
      </div>
```

bằng:

```html
      <div id="sidebar-header">
        <div class="sidebar-header-actions">
          <button type="button" id="toggle-sidebar" class="icon-btn" title="Thu gọn/mở rộng danh sách table">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button type="button" id="open-import-folder" class="icon-btn icon-btn-import" title="Import từ thư mục (không cần chọn table trước)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button type="button" id="open-export-schema" class="icon-btn icon-btn-export" title="Export toàn bộ schema (không cần chọn table trước)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
        <div class="search-wrap">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="class-search" placeholder="Tìm table theo tên..." autocomplete="off" />
        </div>
      </div>
```

- [ ] **Step 2: Mở rộng khối `#export-overlay`**

Thay TOÀN BỘ khối `<div id="export-overlay" hidden>...</div>` hiện có
(dòng 165-199, có thể đã lệch vài dòng do Bước 1 vừa thêm — tìm theo nội
dung, không theo số dòng) bằng:

```html
  <div id="export-overlay" hidden>
    <div class="dialog-card">
      <h2>Export dữ liệu</h2>
      <div class="field">
        <label class="field-title">Phạm vi</label>
        <label class="radio-option">
          <input type="radio" name="export-target" id="export-target-table" value="table" checked />
          1 table
        </label>
        <label class="radio-option">
          <input type="radio" name="export-target" id="export-target-schema" value="schema" />
          Toàn bộ schema
        </label>
      </div>
      <div class="field" id="export-table-scope-block">
        <label class="field-title">Phạm vi dữ liệu</label>
        <label class="radio-option">
          <input type="radio" name="export-scope" id="export-scope-current" value="current" />
          Dữ liệu hiện tại (đang áp dụng filter)
        </label>
        <label class="radio-option">
          <input type="radio" name="export-scope" id="export-scope-all" value="all" />
          Toàn bộ dữ liệu
        </label>
      </div>
      <div class="field" id="export-schema-folder-block" hidden>
        <label class="field-title" for="export-schema-folder">Tên thư mục con <span class="field-hint">(để trống = xuất thẳng vào exports/)</span></label>
        <input type="text" id="export-schema-folder" placeholder="vd: MJDL211" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-title">Format</label>
        <label class="radio-option">
          <input type="radio" name="export-format" id="export-format-csv" value="csv" checked />
          CSV
        </label>
        <label class="radio-option" id="export-format-excel-option">
          <input type="radio" name="export-format" id="export-format-excel" value="excel" />
          Excel
        </label>
        <label class="radio-option">
          <input type="radio" name="export-format" id="export-format-markdown" value="markdown" />
          Markdown
        </label>
      </div>
      <div id="export-schema-result" class="export-schema-result" hidden></div>
      <div class="edit-actions">
        <button type="button" id="export-cancel" class="btn btn-ghost">Hủy</button>
        <button type="button" id="export-confirm" class="btn btn-primary">Export</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Sửa CSS `#sidebar-header` + `#sidebar.collapsed` + thêm CSS mới**

Trong `public/style.css`, thay 4 dòng hiện tại (dòng 323-326):

```css
#sidebar.collapsed { flex-basis: 44px; }
#sidebar.collapsed .search-wrap,
#sidebar.collapsed #class-list { display: none; }
#sidebar-header { flex: 0 0 auto; display: flex; gap: 6px; padding: 10px; border-bottom: 1px solid var(--border); }
```

bằng:

```css
#sidebar.collapsed { flex-basis: 44px; }
#sidebar.collapsed .search-wrap,
#sidebar.collapsed #class-list,
#sidebar.collapsed #open-import-folder,
#sidebar.collapsed #open-export-schema { display: none; }
#sidebar-header { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 10px; border-bottom: 1px solid var(--border); }
.sidebar-header-actions { display: flex; gap: 6px; }
```

- [ ] **Step 4: Thêm CSS cho nút Export mới + khối kết quả**

Thêm vào cuối `public/style.css`:

```css
/* ---------- Export schema (entry point sidebar + result list) ---------- */
.icon-btn-export { color: var(--export); }
.icon-btn-export:hover { background: var(--export-soft); border-color: var(--export); box-shadow: 0 0 10px var(--export-border); }

.export-schema-result {
  margin-top: 10px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 12px;
}
.export-schema-result h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  margin: 0 0 6px;
}
.export-schema-result-row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; }
.export-schema-result-row .table-name { color: var(--text); font-weight: 500; }
.export-schema-result-row.ok .table-name { color: var(--success); }
.export-schema-result-row.fail .table-name { color: var(--danger); }
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat(export): add export-schema markup/CSS, split sidebar-header into 2 rows"
```

## Task 4: Frontend — logic trong `importExport.js`

**Files:**
- Modify: `public/js/importExport.js`

- [ ] **Step 1: Thêm `EXPORT_TARGET_IDS` + hàm toggle**

Ngay sau dòng `const EXPORT_FORMAT_IDS = { csv: 'export-format-csv', excel: 'export-format-excel', markdown: 'export-format-markdown' };`
(dòng 10 hiện tại), thêm:

```js
const EXPORT_TARGET_IDS = { table: 'export-target-table', schema: 'export-target-schema' };

function applyExportTargetVisibility() {
  const target = getCheckedRadioValue(EXPORT_TARGET_IDS, 'table');
  el('export-table-scope-block').hidden = target !== 'table';
  el('export-schema-folder-block').hidden = target !== 'schema';
  el('export-format-excel-option').hidden = target === 'schema';
  if (target === 'schema' && el(EXPORT_FORMAT_IDS.excel).checked) {
    el(EXPORT_FORMAT_IDS.excel).checked = false;
    el(EXPORT_FORMAT_IDS.csv).checked = true;
  }
  // Doi Pham vi (theo bat ky huong nao) luon xoa ket qua cu dang hien -
  // tranh nham lan voi ket qua cua lan export truoc.
  el('export-schema-result').hidden = true;
  el('export-schema-result').innerHTML = '';
}

document.querySelectorAll('input[name="export-target"]').forEach((radio) => {
  radio.addEventListener('change', applyExportTargetVisibility);
});
```

- [ ] **Step 2: Sửa handler mở modal cũ + thêm entry point mới**

Thay khối `el('export-data').addEventListener('click', ...)` hiện có (dòng
12-24) bằng:

```js
el('export-data').addEventListener('click', () => {
  if (!state.currentClass) return;
  const hasFilter = !!state.filter;
  const currentRadio = el(EXPORT_SCOPE_IDS.current);
  const allRadio = el(EXPORT_SCOPE_IDS.all);
  currentRadio.disabled = !hasFilter;
  // Không có filter thì "Dữ liệu hiện tại" vô nghĩa (giống hệt "toàn bộ") -
  // khoá lại và tự chọn "Toàn bộ dữ liệu"; có filter thì mặc định chọn
  // "Dữ liệu hiện tại" vì đó là thứ người dùng đang thực sự nhìn thấy.
  currentRadio.checked = hasFilter;
  allRadio.checked = !hasFilter;
  el(EXPORT_TARGET_IDS.table).checked = true;
  el(EXPORT_TARGET_IDS.schema).checked = false;
  applyExportTargetVisibility();
  el('export-overlay').hidden = false;
});

el('open-export-schema').addEventListener('click', () => {
  el(EXPORT_TARGET_IDS.schema).checked = true;
  el(EXPORT_TARGET_IDS.table).checked = false;
  el('export-schema-folder').value = '';
  applyExportTargetVisibility();
  el('export-overlay').hidden = false;
});
```

- [ ] **Step 3: Rẽ nhánh `export-confirm` theo Phạm vi**

Thay khối `el('export-confirm').addEventListener('click', ...)` hiện có
(dòng 34-49, số dòng có thể lệch nhẹ sau Bước 2 — tìm theo nội dung) bằng:

```js
el('export-confirm').addEventListener('click', async () => {
  const target = getCheckedRadioValue(EXPORT_TARGET_IDS, 'table');

  if (target === 'table') {
    const scope = getCheckedRadioValue(EXPORT_SCOPE_IDS, 'all');
    const format = getCheckedRadioValue(EXPORT_FORMAT_IDS, 'csv');
    const filter = scope === 'current' ? state.filter : '';
    const btn = el('export-confirm');
    btn.disabled = true;
    try {
      const result = await api('POST', `/api/objects/${encodeURIComponent(state.currentClass)}/export`, { filter, format });
      el('export-overlay').hidden = true;
      showToast(`Đã export thành công: ${result.fileName} (${result.rowCount} record).`);
    } catch (err) {
      showError(`Export thất bại: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
    return;
  }

  // target === 'schema' - export moi table trong schema, khong phu thuoc
  // state.currentClass, khong can confirm dialog vi day la thao tac doc,
  // khong dung toi/xoa du lieu nguon.
  const folder = el('export-schema-folder').value.trim();
  const format = getCheckedRadioValue(EXPORT_FORMAT_IDS, 'csv');
  const btn = el('export-confirm');
  btn.disabled = true;
  try {
    const result = await api('POST', '/api/export/schema', { folder, format });
    const rows = result.results.map((r) => {
      const status = r.ok
        ? `<span class="table-name">✓ ${r.rowCount} record</span>`
        : `<span class="table-name">✗ ${escapeHtml(r.error)}</span>`;
      return `<div class="export-schema-result-row ${r.ok ? 'ok' : 'fail'}"><span class="table-name">${escapeHtml(r.className)}</span>${status}</div>`;
    });
    const destLabel = folder ? `exports/${folder}` : 'exports/';
    el('export-schema-result').innerHTML = `<h3>Đã lưu vào ${escapeHtml(destLabel)} (${result.successCount} thành công / ${result.failCount} lỗi)</h3>${rows.join('')}`;
    el('export-schema-result').hidden = false;
    showToast(`Đã export ${result.successCount}/${result.results.length} table vào ${destLabel}.`);
  } catch (err) {
    showError(`Export thất bại: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});
```

- [ ] **Step 4: Xác nhận không còn trùng lặp**

Đọc lại toàn bộ `public/js/importExport.js`, xác nhận chỉ có DUY NHẤT 1
khai báo cho mỗi: `el('export-data').addEventListener`,
`el('export-confirm').addEventListener`, `el('open-export-schema')`,
`EXPORT_TARGET_IDS`, `applyExportTargetVisibility`. `escapeHtml` phải VẪN
LÀ hàm đã có sẵn từ tính năng Import folder (không định nghĩa lại).

- [ ] **Step 5: Commit**

```bash
git add public/js/importExport.js
git commit -m "feat(export): wire export-schema target toggle + confirm flow"
```

## Task 5: Verify toàn bộ

**Files:** không tạo file mới trong repo (script verify là file tạm, KHÔNG
commit).

- [ ] **Step 1: Chạy lại toàn bộ test suite backend**

Run: `npm test`
Expected: PASS toàn bộ (test cũ + test mới Task 1/2).

- [ ] **Step 2: Syntax-check các file JS đã sửa**

Run: `node --check public/js/importExport.js && node --check src/exportService.js && node --check src/routes.js && node --check test/exportService.test.js && node --check test/e2e.test.js`
Expected: không có output (không lỗi).

- [ ] **Step 3: Viết script verify frontend tạm (KHÔNG commit)**

Trong scratchpad directory, viết 1 script Node dùng kỹ thuật mock-browser
`vm` giống hệt đã dùng cho Import folder (mock DOM tối thiểu, load 8 file
`public/js/*.js` theo đúng thứ tự, chạy `createApp()` + `buildFixtureRealm()`
thật trên port ephemeral). Lưu ý: `document.querySelectorAll('input[name="export-target"]')`
chạy ở TOP-LEVEL trong `importExport.js` — phải pre-tạo 2 radio
`export-target-table`/`export-target-schema` (tagName INPUT, attribute
`name="export-target"`) TRƯỚC khi load file này, giống cách đã làm với
`import-source-*` ở Import folder.

Kịch bản kiểm:
1. `openConnection(filePath, encryptionKeyHex)` với fixture thật.
2. Dispatch click `open-export-schema` — assert `export-target-schema`
   checked, `export-schema-folder-block.hidden === false`,
   `export-table-scope-block.hidden === true`,
   `export-format-excel-option.hidden === true`.
3. Set `export-schema-folder.value = 'MJDL211-verify'`, dispatch click
   `export-confirm`, `await` xong assert `export-schema-result.hidden === false`
   và nội dung chứa cả `Person` lẫn `Note`.
4. Đọc thật thư mục `exports/MJDL211-verify/` trên đĩa (qua `fs.readdirSync`),
   assert có đúng 2 file `.csv` (Person_*.csv, Note_*.csv), rồi
   `fs.rmSync(..., {recursive:true, force:true})` dọn dẹp.
5. Dispatch click `export-data` (yêu cầu `state.currentClass` đã có từ bước
   1 nếu đã chọn table nào đó qua `selectClass` — nếu chưa chọn table nào,
   gọi `selectClass('Person')` trước) — assert `export-target-table` checked
   trở lại, `export-table-scope-block.hidden === false`,
   `export-format-excel-option.hidden === false` (Excel hiện lại đúng khi
   về chế độ 1 table).
6. `process.exit(0)` cuối script (bắt buộc, xem CLAUDE.md).

Chạy script, xác nhận PASS toàn bộ assert, rồi XÓA script tạm — không
commit.

- [ ] **Step 4: Nhắc user restart thủ công**

Không có hot reload — nhắc user dừng (Ctrl+C) và chạy lại `npm start`
nếu đang có sẵn, F5 trang, để thấy thay đổi.

---

## Ghi chú tổng kết cho người thực thi

- Task 1-2 (backend) độc lập hoàn toàn với Task 3-4 (frontend) — có thể
  làm trước/sau tuỳ ý, chỉ cần cả 2 xong trước Task 5.
- Task 4 phụ thuộc DOM id do Task 3 tạo ra (`export-target-*`,
  `export-schema-folder`, `export-format-excel-option`,
  `export-schema-result`) — phải làm Task 3 trước Task 4.
- Không đổi hành vi Export 1 table hiện có ở bất kỳ task nào — toàn bộ 8
  test cũ trong `test/exportService.test.js` phải tiếp tục PASS nguyên
  trạng sau Task 1.
