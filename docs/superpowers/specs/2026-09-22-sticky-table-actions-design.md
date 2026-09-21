# Sticky Table Actions — Design

## Mục tiêu

Bảng dữ liệu chính (`public/js/table.js` `renderTable()`) có table lên tới
~200 cột — cột checkbox chọn hàng loạt (đầu bảng) và cột action (Sửa/Nhân
bản/Xóa, cuối bảng) bị trôi mất khỏi tầm nhìn khi scroll ngang. Ghim
(sticky) cả 2 cột này lại ở mép trái/phải vùng nhìn thấy của `#table-wrap`
khi scroll ngang, để luôn thao tác được bất kể đang xem cột nào ở giữa.

## Giải pháp

Thuần CSS `position: sticky` (cùng cơ chế header đang dùng để dính khi
scroll dọc: `th { position: sticky; top: 0; }`) — không đổi cấu trúc/thứ tự
cột, không cần JS tính toán vị trí.

- `.select-col` (đầu bảng, cả `th` lẫn `td` đã có sẵn class này): thêm
  `position: sticky; left: 0;`
- `.row-actions` (cuối bảng): thêm `position: sticky; right: 0;`. `<td>` đã
  có class `row-actions`; `<th>` trống hiện tại CHƯA có class — sửa
  `table.js` thêm `class="row-actions"` cho `<th>` này để CSS áp được.
- Cần nền (`background`) tường minh cho ô sticky theo đúng 3 trạng thái đã
  có (header/body thường/body hover) — nếu không, nội dung cột khác sẽ
  "hiện xuyên qua" phía sau khi cuộn ngang, vì sticky cell không tự động kế
  thừa nền từ `<tr>` khi tách ra khỏi flow bình thường lúc cuộn.
- Cần z-index phân tầng: ô góc `<th>` (sticky cả top VÀ left/right cùng
  lúc) phải cao hơn `<td>` sticky trong thân bảng, để khi cuộn dọc, phần
  header luôn nổi trên các dòng dữ liệu chứ không bị dòng dữ liệu đè lên
  (2 phần tử cùng z-index thì phần tử sinh sau trong DOM — ở đây là `<td>`
  trong `tbody`, sinh sau `<th>` trong `thead` — thắng theo thứ tự DOM, nên
  bắt buộc phải tách bậc).
- Thêm viền phân cách (`border-right`/`border-left`, dùng lại màu
  `--border-strong` đã có cho các đường kẻ cột) ở mép trong của 2 cột sticky
  — đánh dấu rõ ranh giới nơi dữ liệu cột khác trôi qua bên dưới, khớp
  ngôn ngữ thị giác "circuit board sắc cạnh" đã có của theme (không dùng
  box-shadow mờ).

## Phạm vi / không đổi

- Không đổi thứ tự cột (checkbox vẫn đầu, action vẫn cuối), không đổi hành
  vi các nút Sửa/Nhân bản/Xóa/chọn hàng loạt.
- Không có thay đổi backend/API, không có test tự động mới (đây là thay
  đổi thuần trình bày — verify bằng mock-browser script tạm như các tính
  năng trước, kiểm tra style/class được áp đúng thay vì kiểm tra pixel).
- Bảng có ít cột (không cần scroll ngang) không bị ảnh hưởng thị giác gì
  (sticky vô hình khi không có gì để cuộn qua).
