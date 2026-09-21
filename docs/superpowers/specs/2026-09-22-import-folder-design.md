# Import Folder — Design

## Mục tiêu

Thêm chế độ **Import từ thư mục** bên cạnh chế độ Import từ 1 file đang có,
cho phép import nhiều table cùng lúc từ 1 thư mục chứa nhiều file
`.csv`/`.md` đặt tên theo quy ước `<tenTable>_<yyyymmdd>_<hhmmss>.<ext>`
(đúng quy ước `exportService.js` đang tạo ra khi Export). Với mỗi table xuất
hiện trong thư mục, tự động chọn file có timestamp mới nhất (không phân biệt
đuôi csv/md). Table nào rút ra từ tên file nhưng không khớp class nào trong
schema của file `.realm` đang mở thì bỏ qua (không lỗi).

Không đổi hành vi Import 1 file hiện có.

## Luồng UX

- **Entry point mới**: 1 icon-button trong `#sidebar-header` (cạnh nút thu
  gọn sidebar), luôn hiện ngay khi đã mở file `.realm` — KHÔNG cần chọn
  table trước (khác nút Import trong toolbar, chỉ hiện khi đã chọn 1 table).
  Bấm vào mở modal Import hiện có, mặc định ở chế độ **Folder**.
- Nút "Import" trong toolbar giữ nguyên: mở modal Import, mặc định ở chế độ
  **File** (hành vi cũ, không đổi).
- Modal Import thêm 1 cặp **radio** "Nguồn dữ liệu": **File** / **Folder**
  (dùng radio, không dùng 2 checkbox độc lập, để nhất quán với convention
  radio-option đã dùng cho export-scope/export-format/import-mode trong
  app và đảm bảo mutually-exclusive).
- Chọn **Folder**: hiện ô nhập đường dẫn thư mục (text input, giống input
  "Đường dẫn file .realm" ở connect-panel) — KHÔNG có nút "Chọn thư mục..."
  vì browser không cho JS lấy absolute path của thư mục qua
  `<input webkitdirectory>` (cùng lý do single-file import phải đọc content
  qua `file.text()` thay vì filePath, đã ghi trong CLAUDE.md). Để trống =
  dùng mặc định thư mục `imports/` ở gốc project. Có nút **"Quét"** cạnh ô
  nhập.
- Bấm **Quét** → gọi API scan, hiển thị preview ngay trong modal:
  - **"Sẽ import (N)"**: từng dòng `tableName → fileName` (file mới nhất đã
    chọn cho table đó)
  - **"Bỏ qua - không có table (M)"**: tên rút ra từ file nhưng không khớp
    class nào trong schema
  - 1 dòng ghi chú nhỏ nếu có: "X file khác không đúng định dạng tên, đã bỏ
    qua"
- Nút **Import** (confirm) chỉ bật khi đã Quét thành công và có ≥1 table sẽ
  import. Sửa ô đường dẫn sau khi đã Quét → disable lại Import + ẩn preview,
  buộc Quét lại (tránh import theo path cũ/stale).
- Radio **Chế độ** (Thêm mới/Ghi đè) dùng chung cho cả File và Folder, áp
  dụng cho TOÀN BỘ table trong đợt import. Chọn Ghi đè ở chế độ Folder →
  confirm dialog liệt kê tên tất cả table sẽ bị xoá trước khi import (mở
  rộng từ confirm hiện có).
- Sau khi Import xong (chế độ Folder): modal KHÔNG tự đóng — thay preview
  bằng bảng kết quả (từng table: ✓ thành công (N record) hoặc ✗ lỗi +
  message), có nút đóng. Refresh count toàn sidebar
  (`loadClassCounts(state.schema)`); nếu `state.currentClass` nằm trong
  danh sách import thành công thì gọi thêm `loadObjects()` để bảng đang xem
  cập nhật ngay.

## Backend

### Quy tắc parse tên file

Áp dụng cho từng file NẰM TRỰC TIẾP trong thư mục (không đệ quy vào thư mục
con, bỏ qua file ẩn/dotfile):

```
/^(.+)_(\d{8})_(\d{6})\.(csv|md)$/i
```

- Nhóm 1 = tên table ứng viên (giữ nguyên hoa/thường trong tên file)
- Nhóm 2+3 ghép lại = khoá sắp xếp thời gian `YYYYMMDDHHMMSS` (so sánh
  chuỗi độ dài cố định là đủ để sắp theo thời gian)
- Nhóm 4 = định dạng (`csv` → format `csv`, `md` → format `markdown`)
- File không khớp pattern này (sai định dạng tên hoặc sai đuôi) → đếm vào
  `ignoredCount`, không hiện chi tiết từng file

### Khớp table + chọn file mới nhất

- So tên table ứng viên với `schema[].name` theo kiểu **case-insensitive**;
  khớp → dùng đúng tên class thật (đúng hoa/thường) từ schema khi gọi
  import, KHÔNG dùng tên lấy từ file. Không khớp → xếp vào `skipped`.
- Gom nhóm theo tên table (case-insensitive) → chọn file có khoá thời gian
  lớn nhất trong nhóm, không phân biệt đuôi csv/md. Trùng khoá thời gian
  tuyệt đối giữa 2 file cùng table (edge case hiếm) → kết quả không đảm bảo
  xác định, chấp nhận không xử lý đặc biệt.

### API mới (thêm vào `importService.js` + `routes.js`, tái dùng thẳng
`importCsv`/`importMarkdown` đã có — không viết lại logic ghi Realm)

```
POST /api/import/folder/scan
  body: { folderPath?: string }
    // rỗng/thiếu => dùng mặc định path.join(__dirname,'..','imports')
    // có giá trị nhưng không phải absolute => resolve tương đối theo
    // project root (cùng cách EXPORT_DIR trong exportService.js làm)
  data: {
    resolvedPath: string,   // absolute path thực sự đã quét, hiện lại cho user
    matched: [{ className, fileName, format, timestamp }],
    skipped: [{ tableNameGuess, fileName, timestamp }],
    ignoredCount: number
  }
  // Thư mục không tồn tại / không phải directory => throw statusCode 400,
  // đi qua cơ chế showError() sẵn có ở frontend (không cần state lỗi inline
  // riêng, giữ đúng invariant "mọi lỗi qua dialog tự vẽ" của CLAUDE.md)

POST /api/import/folder/execute
  body: { resolvedPath: string, matched: [{className, fileName, format}], mode }
  data: {
    results: [
      { className, fileName, ok: true, insertedCount, totalRows, skippedColumns }
      | { className, fileName, ok: false, error }
    ],
    successCount, failCount
  }
  // Đọc lại TỪNG file bằng fs.readFileSync(path.join(resolvedPath, fileName), 'utf8')
  // rồi gọi importCsv/importMarkdown như cũ (dispatch theo format, giống
  // IMPORT_FORMAT_HANDLERS trong routes.js). 1 table lỗi KHÔNG chặn các
  // table còn lại (try/catch từng item trong vòng lặp, gom vào results).
```

Client gửi lại nguyên `resolvedPath` + `matched` đã nhận từ scan khi gọi
execute — backend KHÔNG tự quét lại thư mục ở bước execute, đảm bảo đúng
những gì đã preview cho user xem, tránh lệch logic giữa 2 lần quét (chấp
nhận rủi ro nhỏ file bị đổi giữa lúc scan và execute — dev tool local, không
cần giải quyết thêm).

## Frontend

### `public/index.html`

- `#sidebar-header`: thêm 1 `icon-btn` mới (icon thư mục), title "Import từ
  thư mục" — nằm cạnh `#toggle-sidebar`.
- `#import-overlay`: thêm khối radio "Nguồn dữ liệu" (File / Folder) phía
  trên phần chọn file hiện tại. Toggle hiện/ẩn 2 khối con bằng `hidden`:
  - Khối **File** = markup hiện có, không đổi.
  - Khối **Folder** (mới): input text đường dẫn (`import-folder-path`,
    placeholder `imports (mặc định)`) + nút `import-folder-scan` ("Quét") +
    vùng preview (`import-folder-preview`, ẩn tới khi có kết quả quét) hiện
    2 danh sách matched/skipped + dòng ghi chú ignoredCount.
- Khối "Chế độ" (radio Thêm mới/Ghi đè) giữ nguyên, dùng chung cho cả 2
  nguồn.
- Nút `import-confirm` giữ nguyên vị trí, chỉ đổi hành vi lúc bấm theo
  nguồn đang chọn.

### `public/js/importExport.js`

- Thêm `IMPORT_SOURCE_IDS` radio (`file`/`folder`), listener đổi hiện/ẩn 2
  khối con + reset trạng thái quét khi đổi qua lại.
- Listener click cho nút sidebar mới: mở `import-overlay`, set radio Folder
  = checked, clear input path (về placeholder mặc định), ẩn preview/reset
  `folderScanResult = null`, disable `import-confirm`.
- Listener click cho `import-data` (nút toolbar cũ): thêm dòng set radio
  File = checked trước khi mở overlay, phần còn lại giữ nguyên y hệt.
- `import-folder-scan` click: gọi `POST /api/import/folder/scan`, lưu kết
  quả vào biến module-level `folderScanResult`, render 2 danh sách + ghi
  chú vào `import-folder-preview`, enable `import-confirm` nếu
  `matched.length > 0`.
- Listener `input` trên `import-folder-path`: clear `folderScanResult`, ẩn
  preview, disable `import-confirm` (buộc quét lại).
- `import-confirm` click handler: rẽ nhánh theo
  `getCheckedRadioValue(IMPORT_SOURCE_IDS, 'file')`:
  - `'file'` → y hệt logic hiện tại, không đổi.
  - `'folder'` → validate có `folderScanResult` với `matched.length>0`; nếu
    mode overwrite → `showConfirm` liệt kê tên các table trong `matched`;
    gọi `POST /api/import/folder/execute`; render bảng kết quả (`ok:true` →
    dòng thành công + số record, `ok:false` → dòng lỗi + message) thay cho
    preview, giữ modal mở; gọi `loadClassCounts(state.schema)`; nếu
    `state.currentClass` nằm trong danh sách import thành công thì gọi
    thêm `loadObjects()`.
- Nút Hủy/Đóng đóng overlay như bình thường sau khi xem kết quả xong (tái
  dùng `import-cancel`).

## Edge case & xử lý lỗi

- Thư mục không tồn tại / rỗng / không có file khớp → `matched=[]`, nút
  Import vẫn disabled, preview hiện "Không có table nào để import".
- Lỗi đọc 1 file cụ thể lúc execute (file bị xoá giữa lúc scan và execute,
  lỗi quyền đọc...) → row đó `ok:false` kèm message lỗi, các table khác vẫn
  chạy tiếp bình thường.
- Toàn bộ lỗi hệ thống (không tìm thấy thư mục, lỗi Realm...) đi qua
  `showError` sẵn có — không thêm cơ chế thông báo mới.

## Testing

- `test/importService.test.js`: thêm test cho hàm scan/execute mới dùng
  fixture thật — tạo thư mục tạm (`mkdtemp`) chứa vài file csv/md theo đúng
  quy ước (nhiều file cùng table khác timestamp, tên table không khớp
  schema, file sai định dạng tên) để verify `matched`/`skipped`/
  `ignoredCount` và `insertedCount` sau khi execute.
- `test/e2e.test.js`: thêm test gọi qua HTTP cho 2 route mới
  (`/api/import/folder/scan`, `/api/import/folder/execute`) trên fixture
  Person/Note sẵn có.
- Frontend: verify thủ công bằng kỹ thuật mock-browser `vm` (script tạm,
  không commit) như mô tả trong CLAUDE.md — test nút mới ở sidebar-header,
  toggle File/Folder, quét + import + xem kết quả.

## Ràng buộc / không đổi

- Không đổi hành vi, endpoint, hay markup của Import 1 file hiện có.
- Không thêm dependency ngoài (đọc thư mục bằng `fs`/`path` chuẩn của
  Node).
- Thư mục `imports/` không được server tự tạo (khác `exports/` — vì đây là
  thư mục ĐỌC, không phải nơi ghi ra); thư mục không tồn tại là lỗi hợp lệ,
  báo qua `showError`.
- Thêm `imports/` vào `.gitignore` (cùng nhóm với `exports/`, `logs/`) —
  đây là thư mục dữ liệu cục bộ của dev, không commit nội dung.
