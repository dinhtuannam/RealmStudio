'use strict';

const fs = require('fs');
const path = require('path');
const realmService = require('./realmService');
const { toClientSchema, buildWriteValues } = require('./valueConversion');

// RFC4180-ish CSV parser: handles quoted fields (commas/newlines inside
// quotes), escaped "" for a literal quote, and CRLF or LF line endings.
// A naive .split(',') would break on any quoted field containing a comma,
// which real-world CSVs (including our own exportService output) do have.
function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = content.length;

  while (i < len) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = rows[0];
  const records = rows
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0] === '')) // skip a fully-blank trailing line
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] !== undefined ? r[idx] : '';
      });
      return obj;
    });
  return { headers, records };
}

// Đọc lại đúng định dạng bảng Markdown mà exportService.js's toMarkdown() đã
// ghi ra (`| col1 | col2 |`, dòng kế tiếp `| --- | --- |` là divider, rồi
// tới các dòng dữ liệu) - để import lại chính file vừa export ra, sửa bằng
// text editor, rồi import lại. KHÔNG hỗ trợ Markdown table nói chung (không
// xử lý cột căn lề ":---:" khác divider thường, ô nhiều dòng...) - chỉ là
// nghịch đảo của toMarkdown().
function splitMarkdownRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  // Tách theo dấu '|' KHÔNG bị escape (bỏ qua '\|' - dấu | thật trong giá
  // trị, xem escapeMarkdownCell trong exportService.js).
  const cells = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (trimmed[i] === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += trimmed[i];
  }
  cells.push(current.trim());
  return cells;
}

function isMarkdownDividerRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function parseMarkdownTable(content) {
  const lines = content.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = splitMarkdownRow(lines[0]);
  const dataLines = lines.slice(1).filter((line, idx) => {
    // Dòng ngay sau header là divider ('| --- | --- |') - không phải dữ liệu.
    if (idx === 0 && isMarkdownDividerRow(splitMarkdownRow(line))) return false;
    return true;
  });
  const records = dataLines.map((line) => {
    const cells = splitMarkdownRow(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] !== undefined ? cells[idx] : '';
    });
    return obj;
  });
  return { headers, records };
}

const NUMERIC_PK_TYPES = new Set(['int', 'float', 'double']);

// Yields "1", "2", "3", ... (or numeric 1, 2, 3... for a numeric primary
// key), skipping any value already in `usedPkValues` - so it stays unique
// against both pre-existing table data and rows already inserted earlier
// in the same import.
function createAutoIncrementIdGenerator(primaryKeyType, usedPkValues) {
  let counter = 1;
  function candidateFor(n) {
    return NUMERIC_PK_TYPES.has(primaryKeyType) ? n : String(n);
  }
  return function next() {
    let candidate = candidateFor(counter);
    while (usedPkValues.has(String(candidate))) {
      counter += 1;
      candidate = candidateFor(counter);
    }
    usedPkValues.add(String(candidate));
    counter += 1;
    return candidate;
  };
}

const VALID_MODES = new Set(['overwrite', 'append']);

function validateModeAndContent(mode, content, missingContentMessage) {
  if (!VALID_MODES.has(mode)) {
    const err = new Error(`Chế độ import "${mode}" không hợp lệ. Chỉ hỗ trợ: overwrite, append.`);
    err.statusCode = 400;
    throw err;
  }
  if (!content) {
    const err = new Error(missingContentMessage);
    err.statusCode = 400;
    throw err;
  }
}

// Logic import THUẦN, dùng chung cho mọi định dạng nguồn (CSV, Markdown...) -
// nhận vào {headers, records} đã parse sẵn, không quan tâm định dạng gốc là
// gì. parseCsv()/parseMarkdownTable() là 2 cách khác nhau để tạo ra cùng 1
// shape này.
function importParsedData(className, { headers, records }, mode) {
  const realm = realmService.assertOpen();
  const objSchema = realmService.findSchema(className);
  const clientSchema = toClientSchema(objSchema);
  const schemaColumnNames = new Set(clientSchema.properties.map((p) => p.name));
  // Cột file import không có trong table -> bỏ qua. Cột table không có
  // trong file -> để trống (buildWriteValues/coerceValue áp giá trị mặc
  // định theo type).
  const skippedColumns = headers.filter((h) => !schemaColumnNames.has(h));

  const primaryKey = objSchema.primaryKey || null;
  const primaryKeyType = primaryKey
    ? clientSchema.properties.find((p) => p.name === primaryKey).type
    : null;

  let insertedCount = 0;

  realm.write(() => {
    if (mode === 'overwrite') {
      realm.delete(realm.objects(className));
    }

    const usedPkValues = new Set();
    if (primaryKey) {
      for (const obj of realm.objects(className)) {
        usedPkValues.add(String(obj[primaryKey]));
      }
    }
    const nextAutoId = createAutoIncrementIdGenerator(primaryKeyType, usedPkValues);

    for (const record of records) {
      const fields = {};
      for (const propName of schemaColumnNames) {
        fields[propName] = Object.prototype.hasOwnProperty.call(record, propName) ? record[propName] : '';
      }
      const values = buildWriteValues(objSchema, fields);

      if (primaryKey) {
        const sourceProvidedPk = headers.includes(primaryKey) && record[primaryKey] !== '';
        // File nguồn cho sẵn giá trị primary key: dùng nó, TRỪ KHI trùng với
        // giá trị đã có sẵn (record cũ, hoặc record khác vừa import trong
        // cùng lần này) - lúc đó tự sinh giá trị mới thay vì để Realm từ
        // chối cả lần import vì lỗi trùng khoá.
        if (!sourceProvidedPk || usedPkValues.has(String(values[primaryKey]))) {
          values[primaryKey] = nextAutoId();
        } else {
          usedPkValues.add(String(values[primaryKey]));
        }
      }

      realm.create(className, values);
      insertedCount += 1;
    }
  });

  return { insertedCount, totalRows: records.length, skippedColumns, mode, className };
}

function importCsv(className, csvContent, mode) {
  validateModeAndContent(mode, csvContent, 'Thiếu nội dung file CSV.');
  return importParsedData(className, parseCsv(csvContent), mode);
}

function importMarkdown(className, markdownContent, mode) {
  validateModeAndContent(mode, markdownContent, 'Thiếu nội dung file Markdown.');
  return importParsedData(className, parseMarkdownTable(markdownContent), mode);
}

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

module.exports = {
  importCsv, importMarkdown, parseCsv, parseMarkdownTable,
  scanImportFolder, executeImportFolder,
};
