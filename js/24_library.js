/**
 * SCMS v11 — 24_library.js
 * Book catalog + checkout/return tracking.
 *
 * All detail/edit/checkout views render into a SINGLE modal body
 * (#bookDetailBody) that gets its innerHTML swapped — same pattern learned
 * from Admissions/Billing: never a second stacked openModal() call once the
 * detail sheet is open, and object data (like the current book) is kept in
 * a module-level cache rather than round-tripped through onclick HTML
 * attributes (that caused a real, hard-to-spot bug in Health Records).
 *
 * Web only for now — no n8n/Telegram equivalent yet.
 */

'use strict';

let _libraryBooksAll   = [];
let _libraryLoadedOnce = false;
let _libraryBookCache  = null; // the currently-open book, for the edit/checkout views

async function renderLibrary() {
  const listEl = document.getElementById('libraryList');
  if (_libraryLoadedOnce) {
    _renderLibraryList();
  } else if (listEl) {
    listEl.innerHTML = skeletonCards(2);
  }

  try {
    _libraryBooksAll = await API.getBooks();
    _libraryLoadedOnce = true;
  } catch (e) {
    if (!_libraryLoadedOnce && listEl) listEl.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  _renderLibrarySummary();
  _renderLibraryList();
}

function _renderLibrarySummary() {
  const el = document.getElementById('librarySummary');
  if (!el) return;
  const totalTitles = _libraryBooksAll.length;
  const totalCopies = _libraryBooksAll.reduce((s, b) => s + Number(b.total_copies || 0), 0);
  const checkedOut  = _libraryBooksAll.reduce((s, b) => s + Number(b.checked_out_count || 0), 0);
  el.innerHTML = `
    <div class="billing-summary-row">
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('lib.titles')}</div>
        <div class="billing-summary-value">${esc(String(totalTitles))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('lib.copies')}</div>
        <div class="billing-summary-value">${esc(String(totalCopies))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('lib.checkedOut')}</div>
        <div class="billing-summary-value">${esc(String(checkedOut))}</div>
      </div>
    </div>`;
}

function _renderLibraryList() {
  const el = document.getElementById('libraryList');
  if (!el) return;

  if (!_libraryBooksAll.length) {
    el.innerHTML = `<div class="empty-state">${t('lib.none')}</div>`;
    return;
  }

  el.innerHTML = _libraryBooksAll.map(b => `
    <div class="list-card" onclick="openBookDetail(${b.id})">
      <div class="card-row">
        <div class="card-info">
          <div class="card-name">${esc(b.title)} ${b.category ? `<span class="type-tag">${esc(b.category)}</span>` : ''}</div>
          <div class="card-sub">${esc(b.author || t('lib.unknownAuthor'))}</div>
        </div>
        <div class="card-actions">
          <span class="adm-status-badge ${b.available_copies > 0 ? 'adm-status-accepted' : 'adm-status-rejected'}">${esc(String(b.available_copies))}/${esc(String(b.total_copies))}</span>
        </div>
      </div>
    </div>
  `).join('');
}

/* ─── New book ───────────────────────────────────────────────────────── */

window.openNewBookModal = function() {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('lib.newTitle')}</h3>
      <label class="field-label">${t('lib.title')}</label>
      <input class="form-input" id="nbTitle" placeholder="${esc(t('lib.bookTitle'))}">
      <label class="field-label">${t('lib.author')}</label>
      <input class="form-input" id="nbAuthor" placeholder="${esc(t('health.medicationsOpt'))}">
      <label class="field-label">${t('lib.category')}</label>
      <input class="form-input" id="nbCategory" placeholder="${esc(t('lib.categoryPh'))}">
      <label class="field-label">${t('lib.isbn')}</label>
      <input class="form-input" id="nbIsbn" placeholder="${esc(t('health.medicationsOpt'))}">
      <label class="field-label">${t('lib.copies')}</label>
      <input class="form-input" id="nbCopies" type="number" min="1" value="1">
      <label class="field-label">${t('health.notes')}</label>
      <input class="form-input" id="nbNotes" placeholder="${esc(t('health.medicationsOpt'))}">
      <button class="btn-primary mt16" id="nbSaveBtn" onclick="_saveNewBook()">${t('lib.add')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._saveNewBook = async function() {
  const title = document.getElementById('nbTitle').value.trim();
  if (!title) { showToast(t('lib.enterTitle')); return; }

  const btn = document.getElementById('nbSaveBtn');
  btn.disabled = true; btn.textContent = t('subject.adding');
  try {
    await API.addBook({
      title,
      author: document.getElementById('nbAuthor').value.trim() || null,
      category: document.getElementById('nbCategory').value.trim() || null,
      isbn: document.getElementById('nbIsbn').value.trim() || null,
      total_copies: Number(document.getElementById('nbCopies').value) || 1,
      notes: document.getElementById('nbNotes').value.trim() || null,
    });
    closeModal();
    showToast(t('lib.added'));
    await renderLibrary();
  } catch (e) {
    btn.disabled = false; btn.textContent = t('lib.add');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Detail (single modal — sub-views swap #bookDetailBody in place) ──── */

window.openBookDetail = function(id) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div id="bookDetailBody">${skeletonCards(1)}</div>
    </div>
  `);
  _loadBookDetail(id);
};

async function _loadBookDetail(id) {
  const el = document.getElementById('bookDetailBody');
  if (!el) return;
  try {
    _libraryBookCache = _libraryBooksAll.find(b => b.id === id) || null;
    const checkouts = await API.getBookCheckouts(id);
    _renderBookDetailView(id, checkouts);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
  }
}

function _renderBookDetailView(id, checkouts) {
  const el = document.getElementById('bookDetailBody');
  if (!el) return;
  const b = _libraryBookCache;
  if (!b) { el.innerHTML = `<div class="empty-state">${t('common.itemNotFound')}</div>`; return; }

  const active = checkouts.filter(c => !c.returned_date);
  const past   = checkouts.filter(c => c.returned_date);

  el.innerHTML = `
    <h3 class="modal-title">${esc(b.title)}</h3>
    <div class="billing-detail-items">
      <div class="billing-detail-row"><span>${t('lib.author')}</span><span>${esc(b.author || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('lib.category')}</span><span>${esc(b.category || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('lib.isbn')}</span><span>${esc(b.isbn || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('lib.copies')}</span><span>${esc(t('lib.avail', { a: b.available_copies, t: b.total_copies }))}</span></div>
    </div>
    ${b.notes ? `<p class="billing-notes">${esc(b.notes)}</p>` : ''}

    ${b.available_copies > 0 ? `<button class="btn-primary mt16" onclick="_showCheckoutView(${id})">${t('lib.checkoutBtn')}</button>` : ''}

    <div class="billing-section-title mt16">${t('lib.currentlyOut')}</div>
    ${active.length ? active.map(c => `
      <div class="row-with-delete">
        <span>${esc(c.student_name)} <span class="muted-note">${esc(t('lib.since', { date: fmtDate(c.checked_out_date) }))}${c.due_date ? esc(t('lib.due', { date: fmtDate(c.due_date) })) : ''}</span></span>
        <button class="btn-pill-action ghost" onclick="_returnBook(${c.id}, ${id})">${t('lib.return')}</button>
      </div>
    `).join('') : `<p class="muted-note">${t('lib.none2')}</p>`}

    ${past.length ? `
      <div class="billing-section-title mt16">${t('lib.history')}</div>
      ${past.map(c => `
        <div class="row-with-delete">
          <span>${esc(c.student_name)}</span>
          <span class="muted-note">${esc(fmtDate(c.checked_out_date))} → ${esc(fmtDate(c.returned_date))}</span>
        </div>
      `).join('')}
    ` : ''}

    <button class="btn-secondary mt16" onclick="_showEditBookView(${id})">${t('lib.editTitle')}</button>
    <button class="btn-secondary" onclick="_confirmDeleteBook(${id})">${t('lib.delTitle').replace('🗑 ', '').replace('?','')}</button>
  `;
}

window._showEditBookView = function(id) {
  const el = document.getElementById('bookDetailBody');
  if (!el) return;
  const b = _libraryBookCache;
  if (!b) return;

  el.innerHTML = `
    <h3 class="modal-title">${t('lib.editTitle')}</h3>
    <label class="field-label">${t('lib.title')}</label>
    <input class="form-input" id="ebTitle" value="${esc(b.title)}">
    <label class="field-label">${t('lib.author')}</label>
    <input class="form-input" id="ebAuthor" value="${esc(b.author || '')}">
    <label class="field-label">${t('lib.category')}</label>
    <input class="form-input" id="ebCategory" value="${esc(b.category || '')}">
    <label class="field-label">${t('lib.isbn')}</label>
    <input class="form-input" id="ebIsbn" value="${esc(b.isbn || '')}">
    <label class="field-label">${t('lib.totalCopies')}</label>
    <input class="form-input" id="ebCopies" type="number" min="0" value="${esc(String(b.total_copies))}">
    <label class="field-label">${t('health.notes')}</label>
    <input class="form-input" id="ebNotes" value="${esc(b.notes || '')}">
    <button class="btn-primary mt16" id="ebSaveBtn" onclick="_saveEditBook(${id})">${t('common.saveChanges')}</button>
    <button class="btn-secondary" onclick="_loadBookDetail(${id})">${t('common.cancel')}</button>
  `;
};

window._saveEditBook = async function(id) {
  const title = document.getElementById('ebTitle').value.trim();
  if (!title) { showToast(t('lib.titleRequired')); return; }

  const btn = document.getElementById('ebSaveBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    await API.updateBook(id, {
      title,
      author: document.getElementById('ebAuthor').value.trim() || null,
      category: document.getElementById('ebCategory').value.trim() || null,
      isbn: document.getElementById('ebIsbn').value.trim() || null,
      total_copies: Number(document.getElementById('ebCopies').value),
      notes: document.getElementById('ebNotes').value.trim() || null,
    });
    showToast(t('common.saved'));
    await renderLibrary();
    await _loadBookDetail(id);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.saveChanges');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._showCheckoutView = function(id) {
  const el = document.getElementById('bookDetailBody');
  if (!el) return;
  el.innerHTML = `
    <h3 class="modal-title">${t('lib.checkoutTitle')}</h3>
    <label class="field-label">${t('lib.student')}</label>
    <button type="button" class="form-picker-trigger" id="coStudentBtn" onclick="openStudentPicker({onPick:_onCheckoutStudentPicked})">
      <span class="form-picker-value" id="coStudent_label">${t('lib.selectStudent')}</span>
      <svg class="form-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <input type="hidden" id="coStudentId" value="">
    <label class="field-label">${t('bill.dueDate')}</label>
    <input class="form-input" id="coDueDate" type="date">
    <button class="btn-primary mt16" id="coSaveBtn" onclick="_saveCheckout(${id})">${t('lib.checkoutBtn2')}</button>
    <button class="btn-secondary" onclick="_loadBookDetail(${id})">${t('common.cancel')}</button>
  `;
};

window._onCheckoutStudentPicked = function(student) {
  document.getElementById('coStudentId').value = student.student_id;
  document.getElementById('coStudent_label').textContent = student.name_en;
};

window._saveCheckout = async function(id) {
  const studentId = document.getElementById('coStudentId').value;
  if (!studentId) { showToast(t('lib.pickStudent')); return; }

  const btn = document.getElementById('coSaveBtn');
  btn.disabled = true; btn.textContent = t('lib.checkingOut');
  try {
    await API.checkoutBook(id, studentId, document.getElementById('coDueDate').value || null, null);
    showToast(t('lib.checkedOutToast'));
    await renderLibrary();
    await _loadBookDetail(id);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('lib.checkoutBtn2');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._returnBook = async function(checkoutId, bookId) {
  try {
    await API.returnBook(checkoutId);
    showToast(t('lib.returnedToast'));
    await renderLibrary();
    await _loadBookDetail(bookId);
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._confirmDeleteBook = function(id) {
  showConfirm(
    t('lib.delTitle'),
    t('lib.delBody'),
    t('btn.delete'),
    async () => {
      try {
        await API.deleteBook(id);
        closeModal();
        showToast(t('common.deleted'));
        await renderLibrary();
      } catch (e) {
        const msg = e.code === 'has_active_checkouts' ? t('lib.mustReturn') : (e.message || t('common.error'));
        showToast(t('common.deleteFailed', { err: msg }));
      }
    }
  );
};
