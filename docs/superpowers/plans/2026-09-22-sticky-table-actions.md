# Sticky Table Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Chính sách commit (CLAUDE.md của project):** KHÔNG tự ý `git commit`
> trừ khi user đã yêu cầu rõ trong phiên đó.

**Goal:** Ghim (sticky) cột checkbox (đầu bảng) và cột action Sửa/Nhân
bản/Xóa (cuối bảng) lại ở mép trái/phải vùng nhìn thấy khi scroll ngang qua
bảng nhiều cột (~200 cột), thay vì trôi mất khỏi màn hình.

**Architecture:** Thuần CSS `position: sticky` trên 2 class đã có sẵn
(`.select-col`, `.row-actions`), cùng cơ chế header đang dùng `position:
sticky; top: 0`. Không đổi cấu trúc/thứ tự cột. 1 chỗ sửa JS duy nhất: gắn
class `row-actions` cho `<th>` trống của cột action (hiện chưa có class gì
để CSS bám vào).

**Tech Stack:** CSS thuần, vanilla JS (`public/js/table.js`).

**Spec:** `docs/superpowers/specs/2026-09-22-sticky-table-actions-design.md`

---

## Task 1: Gắn class cho `<th>` cột action

**Files:**
- Modify: `public/js/table.js:61`

- [ ] **Step 1: Sửa dòng tạo `<th>` trống của cột action**

Dòng 61 hiện tại:

```js
  headRow.appendChild(document.createElement('th'));
```

Sửa thành:

```js
  const actionTh = document.createElement('th');
  actionTh.className = 'row-actions';
  headRow.appendChild(actionTh);
```

- [ ] **Step 2: Syntax-check**

Run: `node --check public/js/table.js`
Expected: không có output (không lỗi).

## Task 2: CSS sticky cho `.select-col` + `.row-actions`

**Files:**
- Modify: `public/style.css:430-431`

- [ ] **Step 1: Thay 2 dòng CSS hiện tại**

Dòng 430-431 hiện tại:

```css
.row-actions { display: flex; gap: 4px; }
.select-col { width: 1%; white-space: nowrap; text-align: center; }
```

Thay bằng:

```css
.row-actions { display: flex; gap: 4px; position: sticky; right: 0; border-left: 2px solid var(--border-strong); }
.select-col { width: 1%; white-space: nowrap; text-align: center; position: sticky; left: 0; border-right: 2px solid var(--border-strong); }
/* Sticky cell can KHONG tu ke thua nen tu <tr> khi tach khoi flow luc
   cuon - phai gan nen tuong minh theo dung 3 trang thai (header/body
   thuong/body hover), khong thi noi dung cot khac se "hien xuyen qua"
   phia sau khi cuon ngang. */
td.select-col, td.row-actions { z-index: 2; background: var(--bg-panel); }
tbody tr:hover td.select-col, tbody tr:hover td.row-actions { background: var(--bg-hover); }
/* z-index cao hon td sticky (2) vi <th> sticky CA top LAN left/right (o goc)
   - can luon noi tren cac dong du lieu khi cuon doc, khong bi <td> (sinh
   sau trong DOM, cung z-index se thang theo thu tu DOM) de len. */
th.select-col, th.row-actions { z-index: 3; background: var(--bg-hover); }
```

- [ ] **Step 2: Commit**

```bash
git add public/js/table.js public/style.css
git commit -m "feat(table): pin checkbox + action columns while scrolling wide tables"
```

## Task 3: Verify

**Files:** không tạo file mới trong repo (script verify tạm, KHÔNG commit).

- [ ] **Step 1: Chạy lại toàn bộ test suite backend (đảm bảo không đụng gì)**

Run: `npm test`
Expected: PASS toàn bộ (không có test nào liên quan tới thay đổi thuần CSS
này, chỉ chạy để chắc chắn không lỡ tay đổi file backend nào).

- [ ] **Step 2: Viết script verify frontend tạm (KHÔNG commit)**

Dùng lại đúng kỹ thuật mock-browser `vm` đã dùng cho 2 tính năng trước
(mock DOM tối thiểu, load 8 file `public/js/*.js`, chạy `createApp()` +
`buildFixtureRealm()` thật). Vì đây là thay đổi THUẦN CSS (mock DOM không
áp dụng `<style>` thật, không đo được `position: sticky` bằng mock), phần
verify JS chỉ cần xác nhận đúng 1 điều: header `<th>` của cột action có
`className === 'row-actions'` sau khi `renderTable()` chạy (mock DOM có hỗ
trợ `className`/`classList` nên kiểm được).

Kịch bản kiểm:
1. `openConnection(filePath, encryptionKeyHex)` với fixture thật.
2. `selectClass('Person')`, `await loadObjects()` (hoặc gọi qua
   `vm.runInContext('selectClass', sandbox)('Person')` rồi đợi Promise).
3. Đọc `document-mock`'s `table-wrap` con `<table><thead><tr>` — lấy `<th>`
   CUỐI CÙNG, assert `className === 'row-actions'`.
4. `process.exit(0)` cuối script.

Chạy script, xác nhận PASS, XÓA script tạm.

- [ ] **Step 3: Verify CSS bằng mắt qua browser thật**

Vì mock DOM không render CSS thật, bước cuối PHẢI nhắc user (không tự làm
được trong môi trường CLI này): chạy `npm start`, mở 1 file `.realm` có
table nhiều cột (hoặc F12 thu nhỏ `#table-wrap` để giả lập), scroll ngang,
xác nhận cột checkbox dính bên trái, cột action dính bên phải, không bị
đè/xuyên nội dung cột khác.

---

## Ghi chú tổng kết cho người thực thi

- Task 1 và Task 2 độc lập nhau (Task 2 không phụ thuộc class do Task 1
  thêm để có style — CSS áp được ngay cả trước khi có class, nhưng cần cả
  2 mới thấy đủ hiệu ứng trên `<th>`), có thể làm theo thứ tự bất kỳ, chạy
  Task 3 sau khi cả 2 xong.
- Không có backend, không có route, không có test tự động mới ngoài 1
  script verify tạm không commit — khớp đúng phạm vi nhỏ của thay đổi này.
