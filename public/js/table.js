'use strict';

// Vẽ bảng dữ liệu chính (renderTable) + chọn hàng loạt bằng checkbox + xóa
// (1 record hoặc nhiều record cùng lúc). Phụ thuộc core.js. renderTable()
// gọi openEditForm() (editForm.js) qua closure trong nút Sửa/Nhân bản - chỉ
// resolve lúc người dùng thật sự bấm, nên không cần editForm.js load trước.

function emptyState(iconSvg, message) {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.innerHTML = iconSvg; // icon SVG là markup cố định, không phải dữ liệu record
  const p = document.createElement('p');
  p.textContent = message; // message luôn là chuỗi tĩnh do ta viết, không phải dữ liệu record
  box.appendChild(p);
  return box;
}

function updateBulkDeleteUi() {
  const count = state.selectedRefs.size;
  el('bulk-delete').hidden = count === 0;
  el('bulk-delete-count').textContent = String(count);
}

function selectedCountAmongRows() {
  return state.rows.filter((r) => state.selectedRefs.has(String(r.__ref))).length;
}

function syncSelectAllCheckbox(selectAllCheckbox) {
  const total = state.rows.length;
  const selected = selectedCountAmongRows();
  selectAllCheckbox.checked = total > 0 && selected === total;
  selectAllCheckbox.indeterminate = selected > 0 && selected < total;
  selectAllCheckbox.disabled = total === 0;
}

function renderTable() {
  const wrap = el('table-wrap');
  wrap.innerHTML = '';
  if (!state.currentSchema) {
    wrap.appendChild(emptyState(ICONS.database, 'Chọn 1 table ở sidebar để xem dữ liệu'));
    updateBulkDeleteUi();
    return;
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  const selectAllTh = document.createElement('th');
  selectAllTh.className = 'select-col';
  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.title = 'Chọn tất cả record đang hiển thị';
  selectAllTh.appendChild(selectAllCheckbox);
  headRow.appendChild(selectAllTh);

  for (const prop of state.currentSchema.properties) {
    const th = document.createElement('th');
    th.textContent = prop.name;
    headRow.appendChild(th);
  }
  const actionTh = document.createElement('th');
  actionTh.className = 'row-actions';
  headRow.appendChild(actionTh);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (state.rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'empty-cell';
    td.colSpan = state.currentSchema.properties.length + 2;
    td.textContent = state.filter
      ? 'Không có record nào phù hợp với filter hiện tại.'
      : 'Class này chưa có record nào.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  for (const row of state.rows) {
    const tr = document.createElement('tr');
    const refKey = String(row.__ref);
    tr.dataset.ref = refKey;

    const selectTd = document.createElement('td');
    selectTd.className = 'select-col';
    const rowCheckbox = document.createElement('input');
    rowCheckbox.type = 'checkbox';
    rowCheckbox.className = 'row-select-checkbox';
    rowCheckbox.checked = state.selectedRefs.has(refKey);
    rowCheckbox.addEventListener('change', () => {
      if (rowCheckbox.checked) state.selectedRefs.add(refKey);
      else state.selectedRefs.delete(refKey);
      syncSelectAllCheckbox(selectAllCheckbox);
      updateBulkDeleteUi();
    });
    selectTd.appendChild(rowCheckbox);
    tr.appendChild(selectTd);

    for (const prop of state.currentSchema.properties) {
      const td = document.createElement('td');
      const value = row[prop.name];
      td.textContent = value && typeof value === 'object' && value.__complex
        ? `[${value.type}] ${value.preview}`
        : String(value ?? '');
      tr.appendChild(td);
    }
    const actionTd = document.createElement('td');
    actionTd.className = 'row-actions';
    const actionGroup = document.createElement('div');
    actionGroup.className = 'row-actions-group';
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn icon-btn-edit';
    editBtn.title = 'Sửa';
    editBtn.innerHTML = ICONS.edit;
    editBtn.addEventListener('click', () => openEditForm(row));
    const dupBtn = document.createElement('button');
    dupBtn.className = 'icon-btn icon-btn-duplicate';
    dupBtn.title = 'Nhân bản';
    dupBtn.innerHTML = ICONS.copy;
    dupBtn.addEventListener('click', () => openEditForm(row, { duplicate: true }));
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn icon-btn-danger';
    delBtn.title = 'Xóa';
    delBtn.innerHTML = ICONS.trash;
    delBtn.addEventListener('click', () => deleteRow(row));
    actionGroup.appendChild(editBtn);
    actionGroup.appendChild(dupBtn);
    actionGroup.appendChild(delBtn);
    actionTd.appendChild(actionGroup);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  syncSelectAllCheckbox(selectAllCheckbox);
  selectAllCheckbox.addEventListener('change', () => {
    const checked = selectAllCheckbox.checked;
    for (const row of state.rows) {
      const refKey = String(row.__ref);
      if (checked) state.selectedRefs.add(refKey);
      else state.selectedRefs.delete(refKey);
    }
    tbody.querySelectorAll('.row-select-checkbox').forEach((cb) => { cb.checked = checked; });
    updateBulkDeleteUi();
  });

  if (state.lastMutatedRef !== null) {
    const target = tbody.querySelector(`[data-ref="${CSS.escape(String(state.lastMutatedRef))}"]`);
    if (target) target.classList.add('row-highlight');
    state.lastMutatedRef = null;
  }
  updateBulkDeleteUi();
}

async function deleteRow(row) {
  const confirmed = await showConfirm('Bạn có chắc muốn xóa record này không?');
  if (!confirmed) return;
  try {
    const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';
    await api(
      'DELETE',
      `/api/objects/${encodeURIComponent(state.currentClass)}/${encodeURIComponent(row.__ref)}${query}`
    );
    await loadObjects();
    refreshOneClassCount(state.currentClass);
    showToast('Đã xóa record thành công.');
  } catch (err) {
    showError(`Xóa thất bại: ${err.message}`);
  }
}

async function bulkDeleteSelected() {
  const refs = Array.from(state.selectedRefs);
  if (refs.length === 0) return;
  const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${refs.length} record đã chọn không?`);
  if (!confirmed) return;

  const hasPrimaryKey = !!(state.currentSchema && state.currentSchema.primaryKey);
  // Class không có primaryKey: __ref là INDEX trong Results hiện tại. Xóa
  // từ index LỚN xuống NHỎ, vì xóa 1 record làm các record phía SAU nó dồn
  // index lên 1 - xóa index lớn trước thì index nhỏ hơn (chưa xử lý) không
  // bị ảnh hưởng. Class có primaryKey thì thứ tự không quan trọng.
  const orderedRefs = hasPrimaryKey ? refs : refs.slice().sort((a, b) => Number(b) - Number(a));
  const query = state.filter ? `?filter=${encodeURIComponent(state.filter)}` : '';

  const btn = el('bulk-delete');
  btn.disabled = true;
  let successCount = 0;
  let firstError = null;
  for (const ref of orderedRefs) {
    try {
      await api(
        'DELETE',
        `/api/objects/${encodeURIComponent(state.currentClass)}/${encodeURIComponent(ref)}${query}`
      );
      successCount += 1;
    } catch (err) {
      if (!firstError) firstError = err.message;
    }
  }
  btn.disabled = false;
  await loadObjects();
  refreshOneClassCount(state.currentClass);
  if (firstError) {
    showError(`Đã xóa ${successCount}/${orderedRefs.length} record đã chọn. Lỗi khi xóa 1 record: ${firstError}`);
  } else {
    showToast(`Đã xóa ${successCount} record đã chọn thành công.`);
  }
}

el('bulk-delete').addEventListener('click', bulkDeleteSelected);
