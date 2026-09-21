# CLAUDE.md — Realm Studio

Đây là ghi chú kỹ thuật viết cho **AI (Claude) đọc lại ở phiên sau**, không
phải cho người. Mục tiêu: đọc file này 1 lần là hiểu đủ để code tiếp/sửa lỗi
mà không cần dò lại toàn bộ codebase hay lặp lại các quyết định đã chốt.
Không cần giữ giọng văn dễ đọc cho người — ưu tiên mật độ thông tin.

## Project là gì

Local dev tool (Node/Express + vanilla HTML/CSS/JS, không build step, không
bundler) để mở/xem/sửa/export/import dữ liệu trong file `.realm` (Realm Swift
20.0.4 / Realm Core 20.1.4) qua browser, phục vụ dev tự kiểm tra dữ liệu khi
test app Swift — **không phải sản phẩm production**. Repo:
`https://github.com/dinhtuannam/RealmStudio.git`.

## Ràng buộc bất di bất dịch (đã chốt qua nhiều lần yêu cầu của user)

Đừng "cải tiến" các điểm này trừ khi user yêu cầu rõ ràng — chúng là quyết
định có chủ đích, không phải sơ suất:

- **Không thêm dependency mới.** Backend chỉ `express` + `realm`. Frontend
  không Tailwind, không CDN font, không framework, không build step — CSS/JS
  tự viết tay. CSV parser/writer, "Excel" export (SpreadsheetML XML, không
  phải `.xlsx` thật) đều tự viết để tránh thêm lib.
- **Frontend là 8 file `<script>` cổ điển (KHÔNG phải ES module).** Xem mục
  "Kiến trúc frontend" bên dưới — đừng đổi sang `type="module"` mà không đọc
  kỹ lý do (ảnh hưởng tới cách viết test bằng `vm`).
- **Mọi text hiển thị cho user phải là tiếng Việt có dấu đầy đủ** — kể cả
  message lỗi từ backend (Realm/realm-core ném lỗi tiếng Anh thì phải dịch
  lại trước khi trả về client, xem `DUPLICATE_PK_PATTERN` trong
  `src/realmService.js` làm ví dụ). Code/comment có thể tiếng Anh hoặc Việt
  (codebase hiện đang trộn cả 2), không cần thống nhất lại.
- **Đây là dev tool, không cân nhắc production**: không auth, không rate
  limit, không cần hardening ngoài validate cơ bản để tránh crash/lỗi khó
  hiểu. Đừng tự ý thêm các thứ đó.
- **Realm luôn mở ở dynamic schema mode** (không khai báo schema JS cố định)
  — đọc đúng schema đã nhúng sẵn trong file do app Swift tạo ra. Đừng đổi
  sang static schema.
- **Không dùng `alert()`/`confirm()` mặc định của browser** — mọi thông báo
  lỗi/xác nhận đều qua dialog tự vẽ theme tối (`showError`/`showConfirm` ở
  `public/js/core.js`).

## Bản đồ thư mục/file

```
server.js              Entry point. Đọc PORT từ env (mặc định 4848, KHÔNG có
                        file .env, KHÔNG dùng dotenv). Tự mở browser bằng
                        `open`/`start`/`xdg-open` khi listen thành công.
install.command         Double-click chạy `npm install` (macOS). Tạo theo
start.command            yêu cầu user vì họ không muốn mở terminal thủ công.

src/
  app.js               createApp({logger}) — Express app factory. Middleware:
                        express.json({limit:'50mb'}) (cần lớn vì import CSV/
                        Markdown gửi nguyên nội dung file qua JSON body),
                        request logger (redact encryptionKeyHex + rút gọn
                        body.content trước khi ghi log), express.static('public') với
                        etag/lastModified TẮT + Cache-Control: no-store (bắt
                        buộc — nếu không browser cache lẫn lộn HTML cũ/JS mới
                        giữa các lần sửa code, trông như "nút có nhưng bấm
                        không chạy gì").
  routes.js            Toàn bộ route /api/*. Mỗi route chỉ gọi 1 hàm ở
                        service tương ứng rồi bọc qua `handle()` (try/catch
                        chung, set statusCode từ err.statusCode || 500). Xem
                        file này để biết CHÍNH XÁC shape request/response của
                        từng endpoint thay vì đoán.
  realmService.js      Quản lý 1 Realm handle DUY NHẤT dùng chung toàn app
                        (biến module-level `currentRealm`) — chỉ mở được 1
                        file tại 1 thời điểm, mở file mới tự đóng file cũ.
                        Export: openRealm, closeRealm, getSchema, findSchema,
                        assertOpen, listObjects, countObjects, createObject,
                        updateObject, deleteObject. KHÔNG export
                        toClientSchema/serializeObject/buildWriteValues nữa
                        (đã tách sang valueConversion.js — xem bên dưới).
  valueConversion.js   Hàm THUẦN (pure), không đụng currentRealm: SIMPLE_TYPES,
                        toClientSchema, serializeValue, serializeObject,
                        coerceValue, buildWriteValues. Tách riêng khỏi
                        realmService.js vì đây là logic convert schema/giá
                        trị qua lại giữa Realm <-> JSON, dùng CHUNG bởi cả
                        realmService.js (CRUD) và importService.js (CSV/
                        Markdown -> giá trị Realm) — trước đây importService.js
                        phải đi vòng qua `realmService.toClientSchema(...)`,
                        giờ require thẳng valueConversion.js.
  importService.js     2 parser độc lập - parseCsv (tự viết, xử lý quoted
                        field/escape/CRLF) và parseMarkdownTable (đọc lại
                        ĐÚNG định dạng bảng mà exportService.toMarkdown() ghi
                        ra, để export ra .md, sửa tay, import lại) - đều trả
                        về CÙNG shape {headers, records}, đưa vào 1 hàm dùng
                        CHUNG importParsedData(className, {headers,records},
                        mode) xử lý PK/skip-column/write transaction. Export
                        ra ngoài: importCsv(className, csvContent, mode) và
                        importMarkdown(className, markdownContent, mode) - 2
                        hàm mỏng, chỉ validate rồi gọi parser tương ứng +
                        importParsedData. Routes.js tự map format ('csv'/
                        'markdown') sang đúng hàm qua IMPORT_FORMAT_HANDLERS
                        (không có 1 hàm "importData(format,...)" chung ở
                        đây, khác với cách exportService tự dispatch bên
                        trong nó). Nhận nội dung file qua field `content`
                        (string) trong JSON body, KHÔNG nhận filePath -
                        browser không cho JS lấy đường dẫn thật của file
                        chọn qua <input type=file>, nên frontend đọc content
                        bằng file.text() rồi POST content lên. Có
                        createAutoIncrementIdGenerator — ĐỌC KỸ comment ở đó
                        nếu sửa, đã từng có bug vòng lặp vô hạn khi PK là
                        string và bị trùng (candidate không được re-tính từ
                        counter mới).
  exportService.js     exportObjects(className, filter, format) -> ghi file
                        vào exports/ (gitignored), tên
                        {table}_yyyymmdd_hhmmss.<ext>. 3 format tự viết:
                        CSV, Markdown, "Excel" (thực chất SpreadsheetML 2003
                        XML — Excel/Numbers/Sheets mở được, không phải .xlsx
                        thật, tránh thêm dependency).
  logger.js            createLogger() — 1 file log/lần chạy server tại
                        logs/app-<iso-timestamp>.log (gitignored).

public/
  index.html           1 trang duy nhất (không SPA router). Chứa TẤT CẢ
                        overlay/dialog dưới dạng <div hidden>: edit-overlay
                        (Thêm mới/Sửa/Nhân bản dùng chung), confirm-overlay,
                        error-overlay, import-overlay, export-overlay,
                        troll-paywall-overlay/troll-quiz-overlay (đùa, xem
                        public/js/troll.js). Thứ tự 8 <script src="js/*.js">
                        ở cuối file CÓ Ý NGHĨA — xem "Kiến trúc frontend" bên
                        dưới, đừng sắp xếp lại tuỳ tiện.
  style.css            Design token trong :root (--bg, --accent, --danger,
                        --edit/--duplicate/--reload/--export/--import/--clear
                        mỗi cái có biến -soft/-border rgba riêng cho từng nút
                        hành động). `[hidden]{display:none!important}` bắt
                        buộc phải có vì nhiều rule `#id{display:flex}` khác
                        outrank rule mặc định của thuộc tính hidden. z-index
                        overlay: edit=100, export/import=200, confirm=300,
                        error=400 (error luôn phải cao nhất vì lỗi có thể xảy
                        ra khi bất kỳ overlay nào khác đang mở).
  js/                  Xem "Kiến trúc frontend" — 8 file, KHÔNG phải ES
                        module, chia sẻ 1 global scope.

test/
  fixtures/buildFixture.js   Tạo 1 file .realm tạm (mkdtemp) với encryption
                              key ngẫu nhiên, 2 class: Person (có primaryKey
                              'id', 2 record p1/p2) và Note (KHÔNG primaryKey,
                              2 record "First"/"Second" theo đúng thứ tự tạo
                              — nhiều test dựa vào thứ tự này cho __ref index).
  realmService.test.js, importService.test.js, exportService.test.js,
  e2e.test.js, logger.test.js, logging.test.js
                        Test thật (KHÔNG mock Realm) — mở file .realm tạm
                        thật, gọi qua src/*.js hoặc qua HTTP thật (e2e.test.js
                        dùng createApp() + fetch thật). `npm test` = `node
                        --test --test-concurrency=1 --test-force-exit
                        test/*.test.js`. Cần `--test-force-exit` vì realm-js
                        giữ process sống sau khi dùng xong (native handle),
                        không tự thoát — THIẾU flag này thì `npm test` treo
                        vô thời hạn. Cần `--test-concurrency=1` (ép chạy TUẦN
                        TỰ từng file, mặc định Node chạy nhiều file test SONG
                        SONG) vì `exportService.test.js` và `e2e.test.js` đều
                        ghi file export cùng table (`Person`/`Note`) thẳng vào
                        `exports/` — tên file chỉ có độ chính xác tới GIÂY
                        (`{table}_yyyymmdd_hhmmss.ext`), nên chạy song song có
                        thể đụng tên file, 1 test dọn dẹp (`rmSync`) đè lên
                        file test kia đang cần → lỗi ENOENT ngẫu nhiên (đã gặp
                        thật khi thêm test cho `exportSchema`). Chỉ quét
                        `test/*.test.js` (không quét cả node_modules).

docs/superpowers/       Spec/plan cũ từ giai đoạn brainstorm/build ban đầu và
                        giai đoạn redesign UI. Tham khảo lịch sử quyết định
                        thiết kế nếu cần, không phải nguồn sự thật hiện tại
                        (code là nguồn sự thật — spec có thể đã lệch so với
                        implementation qua các lần sửa sau đó).

exports/, logs/         Gitignored, tự sinh lúc chạy. *.realm, *.realm.lock,
                        *.realm.management/ cũng gitignored (fixture test tạo
                        trong os.tmpdir(), không phải ở đây).
```

## Kiến trúc frontend (public/js/)

8 file, MỖI FILE LÀ 1 `<script src="...">` CỔ ĐIỂN (không `type="module"`),
load theo đúng thứ tự khai báo trong `index.html`:

```
core.js → sidebar.js → connection.js → table.js → editForm.js → importExport.js → troll.js → main.js
```

**Vì sao không dùng ES module:** toàn bộ session build tool này đã dùng 1 kỹ
thuật test không cần browser thật — chạy `public/js/*.js` (trước đây là 1
file `app.js` duy nhất) bên trong Node qua `vm.createContext()` +
`vm.runInContext()`, với DOM/fetch/localStorage giả lập bằng tay (không có
browser thật trong môi trường này). `vm.runInContext` chạy code như classic
script; nếu chuyển sang ES module (`import`/`export`) thì phải dùng
`vm.SourceTextModule` (cần flag `--experimental-vm-modules`, API khác hẳn,
phức tạp hơn nhiều). Giữ classic script để kỹ thuật test này tiếp tục dùng
được nguyên xi — xem mục "Cách verify khi sửa frontend" bên dưới.

**Vì sao thứ tự file (phần lớn) không quan trọng dù chia sẻ 1 scope:** các
file gọi hàm của nhau CHỈ bên trong closure (event handler / thân hàm async),
được resolve lúc người dùng thao tác thật — tức là SAU KHI toàn bộ 8 script
đã chạy xong tuần tự. Ví dụ `table.js` gọi `openEditForm(row)` (định nghĩa ở
`editForm.js`, load SAU `table.js`) bên trong 1 `addEventListener('click', …)`
— hợp lệ vì `openEditForm` đã tồn tại trong global scope từ trước khi user
kịp click bất cứ gì.

**2 ràng buộc cứng về thứ tự:**
- `core.js` PHẢI load đầu tiên — mọi file khác có code TOP-LEVEL (không nằm
  trong hàm) gọi `el(...)` ngay lúc file chạy (VD: `el('class-search').addEventListener(...)` ở top-level của `sidebar.js`), và `el` chỉ được định
  nghĩa ở `core.js`.
- `main.js` PHẢI load cuối cùng — nó có 1 IIFE top-level gọi
  `openConnection(...)` ngay lập tức nếu có connection đã lưu trong
  localStorage, cần MỌI hàm khác (openConnection ở connection.js,
  renderClassList ở sidebar.js, v.v.) đã tồn tại.

Giữa `sidebar.js`/`connection.js`/`table.js`/`editForm.js`/`importExport.js`/
`troll.js`: thứ tự không quan trọng về mặt chạy đúng, nhưng thứ tự hiện tại
được sắp theo luồng phụ thuộc logic (connection load data → table hiển thị
data → editForm sửa data → importExport nhập/xuất data → troll đùa sau khi
editForm lưu) để dễ đọc.

**Nội dung từng file** (đọc trực tiếp file để biết chi tiết, đây chỉ là mục
lục):
- `core.js` — ICONS (SVG string), STORAGE_KEYS, `state` (object trung tâm
  DUY NHẤT, mọi file đọc/ghi thẳng vào đây, không có store pattern/event bus
  gì phức tạp hơn), `el()`, `loadRequestId` (chống race condition khi request
  cũ trả về sau request mới), `loadSavedConnection`/`saveConnection`, `api()`
  (fetch wrapper ném Error nếu `payload.ok === false`), `getCheckedRadioValue`
  (dùng chung cho export scope/format và import mode), `showToast`,
  `showError`, `showConfirm`.
- `sidebar.js` — danh sách table bên trái + tìm kiếm + đếm số record/table.
- `connection.js` — mở file, chọn table, load/phân trang record
  (`loadObjects`/`loadMoreObjects`), đồng bộ URL query string (`?class=&filter=`) để F5 giữ nguyên view.
- `table.js` — vẽ bảng (`renderTable`), checkbox chọn từng dòng + chọn tất
  cả, xóa 1 dòng (`deleteRow`), xóa hàng loạt (`bulkDeleteSelected`).
- `editForm.js` — modal Thêm mới/Sửa/Nhân bản dùng CHUNG 1 form
  (`openEditForm(sourceRow, {duplicate})` — `sourceRow=null` → thêm mới,
  `sourceRow` có giá trị + `duplicate=false` → sửa (primaryKey bị khoá input),
  `duplicate=true` → nhân bản (primaryKey KHÔNG khoá, vì đây là tạo record
  mới, bắt buộc phải đổi PK)).
- `importExport.js` — modal Export (CSV/Excel/Markdown, phạm vi dữ liệu hiện
  tại/toàn bộ) và Import (CSV hoặc Markdown, chế độ Ghi đè/Thêm mới, cảnh báo
  khi tên file không khớp tên table qua `fileNameMatchesTable`). Import
  KHÔNG có radio chọn format — `detectImportFormat(fileName)` tự suy ra
  'csv'/'markdown' từ ĐUÔI FILE lúc chọn file (`.md`/`.markdown` → markdown,
  còn lại → csv), lưu vào biến `importFileFormat` module-level. Đã từng có
  radio chọn format riêng nhưng bị bỏ theo yêu cầu user vì dư thừa (đuôi
  file đã đủ phân biệt) — đừng thêm lại radio đó.
- `troll.js` — TRÒ ĐÙA đồng nghiệp, KHÔNG phải tính năng thật, không ảnh
  hưởng dữ liệu/logic chính. Sau lần "Lưu" thành công thứ 3
  (`notifyEditFormSaved()`, gọi từ `editForm.js`), hiện modal giả "hết hạn
  dùng thử" → câu đố đạo hàm 4 đáp án, sai thì chê + rung, đúng thì thôi.
  Chỉ trigger ĐÚNG 1 LẦN DUY NHẤT nhờ cờ `localStorage['realmStudio.trollShown']` (sống sót qua F5) — đánh dấu ngay lúc modal HIỆN RA, không đợi
  giải xong. Nếu user muốn gỡ trò đùa này: xoá `<script src="js/troll.js">`
  trong `index.html`, xoá lời gọi `notifyEditFormSaved()` trong
  `editForm.js`, xoá file `troll.js` và 2 overlay `troll-*` trong
  `index.html` — không đụng gì khác.
- `main.js` — bootstrap, tự mở lại file/key đã lưu.

## Các bất biến/gotcha quan trọng (đọc trước khi sửa phần liên quan)

1. **`realm-js` share 1 native handle theo path trong 1 process.** Mở lại
   CÙNG path (dù là object JS khác) rồi `.close()` "cái cũ" sẽ đóng luôn "cái
   mới" — cả 2 report `isClosed === true`. `openRealm()` trong
   `realmService.js` xử lý bằng cách: nếu path+key giống hệt currentRealm
   đang mở và còn sống → return luôn, KHÔNG gọi `Realm.open()` lại. Đây là lý
   do auto-reconnect (F5 trang) không làm hỏng realm đang mở.
2. **`__ref` là định danh record ở frontend**, giá trị = primaryKey nếu table
   có primaryKey, ngược lại = INDEX vào `Results` (đã filter) tại thời điểm
   list. Với class không có primaryKey: sửa/xóa PHẢI gửi kèm ĐÚNG filter string
   đã dùng lúc list, nếu không index có thể trỏ nhầm record (xem
   `resolveObject` trong `realmService.js`, và cách frontend luôn round-trip
   `state.filter` qua query string `?filter=`).
3. **Xóa hàng loạt (`bulkDeleteSelected` ở `table.js`) trên class KHÔNG có
   primaryKey phải xóa theo thứ tự INDEX GIẢM DẦN** — xóa 1 record làm các
   record phía sau nó (index lớn hơn) dồn xuống 1; xóa từ lớn xuống nhỏ thì
   các index nhỏ hơn (chưa xử lý) không bị ảnh hưởng. Xóa tăng dần sẽ xóa
   nhầm record. Class có primaryKey thì thứ tự không quan trọng.
4. **realm-core ném lỗi tiếng Anh cho duplicate primary key** dạng
   `"Attempting to create an object of type 'X' with an existing primary key
   value 'Y'."` — `DUPLICATE_PK_PATTERN` (regex) trong `createObject` ở
   `realmService.js` bắt pattern này và dịch sang tiếng Việt. Đây là
   pattern-match FRAGILE trên câu chữ chính xác của realm-core — nếu upgrade
   `realm` package và câu chữ đổi, sẽ fallback về hiện nguyên văn tiếng Anh
   (không crash, chỉ mất bản dịch). Nếu thấy lỗi tiếng Anh lọt ra ngoài, kiểm
   tra lại regex này trước.
5. **Import auto-increment ID** (`createAutoIncrementIdGenerator` trong
   `importService.js`): khi PK bị trùng, phải re-tính candidate từ
   `counter` MỚI mỗi vòng lặp (qua hàm `candidateFor(n)`), không được
   re-dùng biến `candidate` cũ — nếu không sẽ vòng lặp vô hạn với PK kiểu
   string. Đã có test riêng ("3 dòng CSV cùng 1 giá trị id") cho case này,
   ĐỪNG XÓA test đó.
6. **Import nhận nội dung file qua field `content` (string) + `format`
   ('csv'/'markdown') trong JSON body, KHÔNG qua filePath** — quyết định có
   chủ đích vì browser không cho JS đọc đường dẫn thật của file chọn qua
   `<input type=file>`. `express.json({limit:'50mb'})` tồn tại chính vì lý
   do này. `format` không hợp lệ (khác 'csv'/'markdown') bị `routes.js` từ
   chối với lỗi tiếng Việt rõ ràng trước khi gọi tới `importService.js`.
7. **`express.static` phải tắt cache** (`etag:false, lastModified:false`,
   header `Cache-Control: no-store`) — nếu không, sửa `public/*` xong F5 có
   thể vẫn thấy hành vi cũ do browser cache HTML/JS lệch phiên bản nhau.
8. **`npm test` cần `--test-force-exit`** vì `realm-js` giữ process sống sau
   khi dùng — thiếu flag này thì test chạy xong hết nhưng process không
   thoát, treo vô thời hạn.
9. **`z-index` overlay: edit=100 < export/import=200 < confirm=300 <
   error=400.** Confirm phải cao hơn export/import vì luồng "Ghi đè" khi
   import mở confirm đè LÊN TRÊN import-overlay (cố ý để import-overlay vẫn
   còn đó nếu user bấm Hủy). Error phải cao nhất vì lỗi có thể xảy ra bất kỳ
   lúc nào, kể cả khi overlay khác đang mở.
10. **Không có file `.env`, không dùng `dotenv`.** Cấu hình duy nhất là biến
    môi trường `PORT` đọc trực tiếp trong `server.js` (`process.env.PORT || 4848`).

## Cách verify khi sửa frontend (public/js/*.js)

**Không có test frontend nào được commit vào `test/`** (chỉ có test backend
thật, xem trên). Khi sửa `public/js/*.js`, PHẢI tự viết 1 script tạm (KHÔNG
commit) để verify bằng kỹ thuật "mocked browser chạy code thật":

1. Viết script trong scratchpad directory (KHÔNG viết vào repo), dùng
   `vm.createContext()` + mock tối thiểu cho `document`/`localStorage`/
   `location`/`history`/`fetch`/`CSS.escape` (mock `document.getElementById`
   nên auto-vivify element giả có `classList`, `dataset`, `addEventListener`/
   `dispatchEvent`, `querySelector(All)` tree-based, `innerHTML` setter phải
   RESET `_children` — bug hay gặp nếu quên).
2. Load 8 file theo ĐÚNG thứ tự trong `index.html` bằng nhiều lệnh
   `vm.runInContext(fs.readFileSync(...), sandbox)` liên tiếp trên CÙNG 1
   `sandbox` — biến `let`/`const` top-level của file trước vẫn tồn tại khi
   file sau chạy (Node vm giữ chung 1 global lexical scope cho 1 context qua
   nhiều lần `runInContext`), nhưng KHÔNG lộ ra như `sandbox.tenBien` — muốn
   đọc/ghi trực tiếp 1 biến `let`/`const` top-level (VD: `state`,
   `importCsvContent`) thì phải `vm.runInContext('bieu_thuc', sandbox)`, còn
   `function` declaration top-level (VD: `openEditForm`, `selectClass`,
   `bulkDeleteSelected`) THÌ CÓ lộ ra qua `sandbox.tenHam` (gọi thẳng được).
3. Chạy server thật (`createApp()` từ `src/app.js`) + fixture thật
   (`buildFixtureRealm()`) trên 1 port ephemeral, trỏ `fetch` trong sandbox
   về `http://127.0.0.1:<port>` (fetch thật của Node cần URL tuyệt đối, khác
   browser cho phép URL tương đối).
4. Với action async có confirm dialog ở giữa (VD: `bulkDeleteSelected` chờ
   `showConfirm`), gọi hàm/dispatch click TRƯỚC (không await ngay), vì
   Promise.all bên trong `dispatchEvent` chạy hàm listener ĐỒNG BỘ tới điểm
   `await` đầu tiên — nên ngay sau lệnh gọi, confirm-overlay đã hiện và
   listener đã gắn, có thể dispatch click vào `confirm-ok` ngay, rồi mới
   `await` promise gốc.
5. **Luôn thêm `process.exit(...)` ở cuối script** — `realm-js` giữ process
   sống, script gọi `realmService`/mở file `.realm` sẽ KHÔNG tự thoát nếu
   thiếu dòng này (giống lý do cần `--test-force-exit` cho `npm test`).
6. Chạy script, xác nhận PASS, rồi **XÓA script tạm** — không commit.
7. Sau khi verify xong, nhắc user restart `npm start` (server không tự
   reload) và F5 trang — KHÔNG có hot reload.

Không cần re-viết script này từ đầu mỗi lần — logic mock DOM ở trên khá ổn
định qua nhiều lần dùng trong session xây dựng tool này, có thể tái sử dụng
gần như nguyên xi.

## Quy ước UI đã thiết lập (giữ nhất quán khi thêm tính năng mới)

- Theme: neon cyberpunk (cyan `--accent` #00f0ff cho viền/focus/active/brand,
  magenta `--primary` #ff2fd6 CHỈ dành cho nút hành động chính mỗi màn hình)
  trên nền đen tuyền `--bg` #05050a — KHÔNG còn là theme "Linear/Vercel" tông
  indigo trung tính như bản redesign đầu tiên, đã đổi hẳn sang hướng này theo
  yêu cầu user. Design token ở `:root` trong `style.css`. Bo góc CỐ Ý nhỏ
  (`--radius-sm/--radius/--radius-lg` chỉ 3/4/6px) cho cảm giác "circuit
  board" sắc cạnh. `.btn-primary`/`.btn-danger` là kiểu "biển neon" (nền kính
  mờ + viền phát sáng + chữ có text-shadow), KHÔNG phải fill đặc 1 màu — đã
  đổi từ fill đặc sang kiểu này vì fill đặc + chữ đen bị chê "xấu". Mỗi hành
  động khác (edit/duplicate/reload/export/import/clear/danger) có màu riêng
  qua class `.btn-*`/`.icon-btn-*`, tất cả có glow (`box-shadow`) khi hover.
  `body`/`#content` có 1 lớp lưới kẻ mờ (`--grid-overlay`) phủ nền. Checkbox
  và radio dùng `appearance: none` tự vẽ hoàn toàn (border/background/`::after`
  cho dấu tick hay chấm tròn) - KHÔNG chỉ dựa `accent-color`, vì đó chỉ đổi
  màu lúc ĐÃ chọn, lúc CHƯA chọn vẫn ra ô vuông/vòng tròn trắng mặc định của
  OS (đã từng bị báo lạc quẻ với theme tối).
- Toast (tự biến mất) cho THÀNH CÔNG, dialog lỗi tự vẽ (chặn tới khi bấm OK)
  cho THẤT BẠI — áp dụng cho MỌI thao tác, không có ngoại lệ kiểu "lỗi nhỏ
  thì bỏ qua im lặng".
- Mọi overlay/dialog đóng được bằng click ra ngoài (backdrop) — nếu thêm
  overlay mới, nhớ thêm listener `if (e.target === overlay) overlay.hidden = true;`.
- Label trong UI dùng từ "table" (không dùng "class") kể từ lần đổi tên gần
  đây — nhưng identifier code (`className`, `.class-item`, `state.currentClass`, endpoint `/api/objects/:className`) VẪN giữ nguyên "class", ĐỪNG đổi
  theo — chỉ đổi text hiển thị.
- Xóa (1 record hay hàng loạt) luôn qua `showConfirm`, không bao giờ xóa
  thẳng không hỏi.

## Việc còn thiếu / giới hạn đã biết (xem thêm README.md)

- Field kiểu list/link/embedded object: chỉ hiển thị read-only
  (`{__complex:true, type, preview}`), chưa hỗ trợ sửa qua UI.
- Chỉ mở được 1 file `.realm` tại 1 thời điểm.
- Danh sách record mặc định tải tối đa `MAX_RESULTS=500`/lần (nút "Xem thêm"
  để phân trang tiếp) — export thì KHÔNG bị giới hạn này (`limit: Infinity`).
