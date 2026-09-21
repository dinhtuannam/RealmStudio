'use strict';

// Modal Export (CSV/Excel/Markdown) và Import (CSV/Markdown, chế độ Ghi
// đè/Thêm mới). Phụ thuộc core.js (state, el, api, showToast, showError,
// showConfirm, getCheckedRadioValue). Gọi loadObjects()/refreshOneClassCount()
// sau khi import xong (connection.js/sidebar.js) - chỉ chạy lúc người dùng
// thao tác, không cần các file đó load trước.

const EXPORT_SCOPE_IDS = { current: 'export-scope-current', all: 'export-scope-all' };
const EXPORT_FORMAT_IDS = { csv: 'export-format-csv', excel: 'export-format-excel', markdown: 'export-format-markdown' };
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

el('export-cancel').addEventListener('click', () => {
  el('export-overlay').hidden = true;
});

el('export-overlay').addEventListener('click', (e) => {
  if (e.target === el('export-overlay')) el('export-overlay').hidden = true;
});

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

const IMPORT_MODE_IDS = { append: 'import-mode-append', overwrite: 'import-mode-overwrite' };
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

// Browser (trình duyệt) không cho JS lấy đường dẫn tuyệt đối thật của file
// chọn qua <input type="file"> (lý do bảo mật) - chỉ có tên file. Nên thay
// vì "path", ta đọc thẳng NỘI DUNG file trong trình duyệt (file.text()) và
// gửi content đó lên server để import, không cần biết path thật ở đâu.
let importFileContent = null;
let importFileName = '';
// Định dạng suy ra thẳng từ đuôi file, không cho chọn riêng - đuôi file đã
// đủ để phân biệt CSV/Markdown, thêm 1 lựa chọn nữa chỉ thừa và dễ chọn sai
// (chọn nhầm "CSV" cho 1 file .md thật ra vẫn để radio ở giá trị cũ...).
let importFileFormat = 'csv';

function detectImportFormat(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'md' || ext === 'markdown' ? 'markdown' : 'csv';
}

// Kiểm tra tên file có "khớp" với table đang chọn không, để cảnh báo trước
// khi import nhầm file. Chấp nhận khớp chính xác (Person.csv) hoặc đúng quy
// ước tên file mà chính tool này tạo ra khi Export (Person_20260913_...csv)
// - bất kỳ tên nào khác đều coi là không khớp và cần cảnh báo.
function fileNameMatchesTable(fileName, tableName) {
  if (!fileName || !tableName) return true;
  const base = fileName.replace(/\.[^./\\]+$/, '');
  const lowerBase = base.toLowerCase();
  const lowerTable = tableName.toLowerCase();
  return lowerBase === lowerTable || lowerBase.startsWith(`${lowerTable}_`);
}

el('import-browse').addEventListener('click', () => {
  el('import-file-input').click();
});

el('import-file-input').addEventListener('change', async () => {
  const file = el('import-file-input').files[0];
  if (!file) return;
  el('import-file-name').textContent = file.name;
  importFileName = file.name;
  importFileFormat = detectImportFormat(file.name);
  try {
    importFileContent = await file.text();
  } catch (err) {
    importFileContent = null;
    importFileName = '';
    el('import-file-name').textContent = 'Chưa chọn file';
    showError(`Không đọc được file: ${err.message}`);
  }
});

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
  el(IMPORT_SOURCE_IDS.folder).checked = false;
  el('import-folder-path').value = '';
  invalidateFolderScan();
  applyImportSourceVisibility();
  el('import-overlay').hidden = false;
});

el('open-import-folder').addEventListener('click', () => {
  el(IMPORT_MODE_IDS.append).checked = true;
  el(IMPORT_MODE_IDS.overwrite).checked = false;
  el(IMPORT_SOURCE_IDS.folder).checked = true;
  el(IMPORT_SOURCE_IDS.file).checked = false;
  el('import-folder-path').value = '';
  invalidateFolderScan();
  applyImportSourceVisibility();
  el('import-overlay').hidden = false;
});

el('import-cancel').addEventListener('click', () => {
  el('import-overlay').hidden = true;
});

el('import-overlay').addEventListener('click', (e) => {
  if (e.target === el('import-overlay')) el('import-overlay').hidden = true;
});

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
    // "Ghi đè" xoá toàn bộ dữ liệu hiện có trước khi import - đây là thao tác
    // phá huỷ dữ liệu không thể hoàn tác trong tool này, nên bắt xác nhận
    // thêm 1 lần nữa (giống Delete), thay vì chỉ dựa vào việc chọn đúng radio.
    // Khi tên file không khớp table, nối thêm cảnh báo vào chính dialog này
    // thay vì hiện thêm 1 dialog riêng.
    if (mode === 'overwrite') {
      let message = `"Ghi đè" sẽ XÓA TOÀN BỘ dữ liệu hiện có trong table "${state.currentClass}" trước khi import từ file. Bạn có chắc chắn muốn tiếp tục?`;
      if (mismatchWarning) message += `\n\n${mismatchWarning}`;
      const confirmed = await showConfirm(message);
      if (!confirmed) return;
    } else if (mismatchWarning) {
      // "Thêm mới" bình thường không cần xác nhận gì thêm - chỉ hiện dialog
      // xác nhận riêng khi phát hiện tên file không khớp table.
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

  // source === 'folder' - import hang loat, khong phu thuoc state.currentClass
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
    // Thay preview bang ket qua, KHONG tu dong dong modal - user tu xem xong
    // roi bam Huy (tai dung nut cu) de dong, vi day la import hang loat
    // nhieu table, can nhin ro table nao thanh cong/loi.
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
