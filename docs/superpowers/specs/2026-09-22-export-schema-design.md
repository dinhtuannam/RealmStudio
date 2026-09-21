# Export Schema — Design

## Mục tiêu

Thêm chế độ **Export toàn bộ schema** bên cạnh Export 1 table hiện có —
export TẤT CẢ table trong schema của file `.realm` đang mở cùng lúc, vào
thư mục mặc định `exports/` (thư mục export hiện có) hoặc 1 thư mục con
người dùng tự đặt tên (vd nhập `MJDL211` → `exports/MJDL211/`). Hỗ trợ 2
format: CSV và Markdown (KHÔNG có Excel, khác Export 1 table đang hỗ trợ cả
3 format).

Không đổi hành vi Export 1 table hiện có.

## UX flow

- **Tách lại `#sidebar-header` thành 2 hàng** (theo yêu cầu — hàng nút hiện
  đã có 3 nút thì chật): hàng 1 gồm các icon-button (thu gọn sidebar, Import
  từ thư mục, **Export toàn bộ schema** — mới), hàng 2 là ô tìm table
  full-width như cũ.
- **Entry point Export toàn bộ schema**: 1 icon-button mới ở hàng nút trên
  (dùng lại icon Export đã có ở nút toolbar), luôn hiện khi đã mở file
  `.realm`, KHÔNG cần chọn table trước (khác nút Export trong toolbar, chỉ
  hiện khi đã chọn 1 table). Khi sidebar ở trạng thái collapsed, ẩn luôn 2
  nút Import-thư-mục/Export-schema (chỉ giữ nút thu gọn) — tiện thể sửa cùng
  lúc vì đang động vào đúng khu vực này (trước đó với 2 nút đã hơi chật ở
  dải sidebar collapsed 44px, chưa ai để ý).
- Modal Export hiện có thêm 1 radio **"Phạm vi"** ở đầu:
  - **1 table** (mặc định khi mở từ nút Export trong toolbar cũ) — giữ
    nguyên y hệt hành vi hiện tại (radio "Phạm vi dữ liệu" hiện tại/toàn bộ
    + Format CSV/Excel/Markdown).
  - **Toàn bộ schema** (mặc định khi mở từ nút sidebar mới) — ẩn khối "Phạm
    vi dữ liệu" (không áp dụng cho export nhiều table), hiện 1 ô nhập text
    "Tên thư mục con" (để trống = xuất thẳng vào `exports/`), và **ẩn lựa
    chọn Excel** trong Format (chỉ còn CSV/Markdown) — nếu đang chọn Excel
    mà đổi sang Toàn bộ schema thì tự chuyển về CSV. Đổi qua lại giữa 2
    Phạm vi luôn xoá kết quả cũ đang hiển thị (nếu có), tránh hiển thị
    nhầm kết quả của lần export trước.
- Bấm **Export** ở chế độ Toàn bộ schema chạy thẳng (KHÔNG cần bước
  Quét/preview như Import folder — export chỉ tạo file mới, không đọc/khớp
  gì cần xem trước, và không phá huỷ dữ liệu nguồn nên không cần confirm
  dialog). Sau khi xong, thay nội dung khối kết quả trong modal bằng
  **danh sách từng table** (✓ N record, hoặc ✗ lỗi), kèm 1 dòng ghi rõ đã
  lưu vào thư mục nào (`exports/` hoặc `exports/MJDL211`). Modal KHÔNG tự
  đóng. Export không đụng tới dữ liệu Realm đang mở (chỉ đọc), nên không
  cần refresh count/reload bảng nào sau khi xong (khác Import folder).

## Backend (`src/exportService.js`)

- Tách `exportObjects(className, filter, format)` hiện có thành gọi 1 hàm
  dùng chung mới `exportObjectsToDir(targetDir, className, filter, format)`
  — `exportObjects` giữ nguyên chữ ký/hành vi cũ hệt (gọi hàm chung với
  `targetDir = EXPORT_DIR`), KHÔNG ảnh hưởng gì tới Export 1 table đang có
  hay các test hiện tại của nó.
- Hàm mới `exportSchema(folderName, format)`:
  - Validate `format` chỉ nhận `csv`/`markdown` (báo lỗi tiếng Việt rõ ràng
    nếu truyền `excel` hoặc giá trị khác).
  - Thư mục đích: `folderName` rỗng/chỉ khoảng trắng → dùng thẳng
    `EXPORT_DIR`; có giá trị → `path.join(EXPORT_DIR, sanitizeForFilename(folderName.trim()))`.
    **Không viết hàm sanitize riêng** — `sanitizeForFilename` sẵn có đã
    thay mọi ký tự ngoài `[a-zA-Z0-9_-]` (gồm `/`, `\`, `.`) thành `_`, nên
    tự động triệt tiêu path traversal (`"../../etc"` → `"______etc"`) mà
    không cần logic riêng.
  - Lặp qua `realmService.getSchema()`, gọi `exportObjectsToDir` cho từng
    class với `filter=''` (luôn toàn bộ data, không áp filter — đây là
    thao tác "chụp toàn bộ" nên không có khái niệm filter riêng từng
    table). **Try/catch riêng từng table** — 1 table lỗi (vd lỗi ghi file)
    KHÔNG chặn các table còn lại, gom kết quả vào mảng `results` (giống
    `executeImportFolder` của Import folder).
  - Trả về `{ resolvedDir, results: [{className, fileName, rowCount, ok:true} | {className, ok:false, error}], successCount, failCount }`.
- Route mới: `POST /api/export/schema` body `{ folder, format }`.

## Frontend

### `public/index.html`

- `#sidebar-header`: bọc 3 icon-button vào `<div class="sidebar-header-actions">`
  mới, `.search-wrap` xuống hàng dưới (2 con trực tiếp của `#sidebar-header`:
  `.sidebar-header-actions` + `.search-wrap`).
- Thêm icon-button `#open-export-schema` (class `icon-btn icon-btn-export`,
  dùng lại đúng SVG icon export ở nút toolbar `#export-data`).
- `#export-overlay`: thêm radio "Phạm vi" (`export-target-table`/
  `export-target-schema`, tên nhóm `export-target`) ở đầu. Bọc khối "Phạm
  vi dữ liệu" hiện có vào `id="export-table-scope-block"`. Thêm khối mới
  `id="export-schema-folder-block"` (input text `#export-schema-folder`,
  hidden mặc định). Thêm `id="export-format-excel-option"` vào `<label>`
  bọc radio Excel (để ẩn được theo Phạm vi). Thêm khối kết quả
  `id="export-schema-result"` (class `export-schema-result`, hidden mặc
  định) trước `.edit-actions`.

### `public/style.css`

- Sửa `#sidebar-header` sang `flex-direction: column`, thêm rule
  `.sidebar-header-actions { display: flex; gap: 6px; }`.
- Mở rộng rule `#sidebar.collapsed` để ẩn thêm `#open-import-folder` và
  `#open-export-schema`.
- Thêm `.icon-btn-export` (dùng token `--export`/`--export-soft`/
  `--export-border` có sẵn, cùng pattern với `.icon-btn-import`,
  `.icon-btn-reload`...).
- Thêm `.export-schema-result` + `.export-schema-result-row` (CSS riêng,
  KHÔNG tái dùng `.import-folder-preview` — trùng lặp nhỏ ~15 dòng nhưng
  tránh động vào class CSS của tính năng Import folder đã ship/test xong,
  giảm rủi ro regression không liên quan).

### `public/js/importExport.js`

- Thêm `EXPORT_TARGET_IDS`, hàm `applyExportTargetVisibility()` (toggle 2
  khối + ẩn option Excel + tự chuyển Excel→CSV nếu cần + luôn xoá kết quả
  cũ), listener `change` trên `input[name="export-target"]` (đăng ký ở
  top-level giống pattern `import-source` của Import folder).
- Sửa handler `#export-data` (mở modal cũ): thêm set `export-target-table`
  checked + reset `export-schema-result`.
- Thêm handler `#open-export-schema`: set `export-target-schema` checked +
  clear `export-schema-folder` + reset `export-schema-result` + mở modal.
- Sửa handler `#export-confirm`: rẽ nhánh theo `EXPORT_TARGET_IDS`.
  Nhánh `'table'` = y hệt logic hiện tại, không đổi. Nhánh `'schema'` gọi
  `POST /api/export/schema`, render danh sách kết quả (tái dùng `escapeHtml`
  đã có từ Import folder) + toast tóm tắt.

## Testing

- `test/exportService.test.js`: thêm test cho `exportSchema` — export toàn
  bộ schema (2 class Person/Note của fixture) ra thư mục mặc định và ra thư
  mục con tự đặt tên; folder name chứa ký tự path traversal (`"../../etc"`)
  phải bị sanitize, không thoát khỏi `EXPORT_DIR`; format `excel` bị từ
  chối rõ ràng.
- `test/e2e.test.js`: thêm test HTTP cho `POST /api/export/schema`.
- Frontend: verify thủ công bằng kỹ thuật mock-browser `vm` (script tạm,
  không commit) như đã làm cho Import folder — test nút mới ở
  sidebar-header, toggle Phạm vi 1 table/Toàn bộ schema (ẩn Excel + tự
  chuyển CSV), Export toàn bộ schema thành công + xem kết quả, đọc lại file
  thật trên đĩa để xác nhận nội dung đúng.

## Ràng buộc / không đổi

- Không đổi hành vi, endpoint, hay markup của Export 1 table hiện có.
- Không thêm dependency ngoài (đọc/ghi thư mục bằng `fs`/`path` chuẩn của
  Node, tái dùng toàn bộ logic build CSV/Markdown đã có trong
  `exportService.js`).
- `exports/` tiếp tục là thư mục ghi (server tự tạo qua `fs.mkdirSync`,
  KHÔNG giống `imports/` là thư mục đọc không tự tạo) — thư mục con do
  `exportSchema` tạo cũng theo đúng nguyên tắc này (`fs.mkdirSync(targetDir, {recursive:true})`).
