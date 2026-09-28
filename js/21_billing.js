/**
 * SCMS v11 — 21_billing.js
 * Fee / Billing: catalog of fee items, invoices per student (with line
 * items), and payments recorded against an invoice. Status (Unpaid /
 * Partial / Paid / Overdue) is computed server-side (rpc_get_invoices /
 * rpc_record_payment) from paid_amount vs total_amount and due_date.
 *
 * Web only for now — this is a new feature with no n8n/Telegram equivalent
 * yet, same as Grading & Assessment.
 */

'use strict';

let _billingClass    = 'All';
let _billingStatus   = 'All';
let _billingTermId   = null;
let _billingTerms    = [];
let _billingFeeItems = [];
let _billingInvoices = [];
let _newInvoiceStudent = null;
let _newInvoiceItems   = [];

const BILLING_STATUSES = ['All', 'Unpaid', 'Partial', 'Paid', 'Overdue'];

let _billingLoadedOnce = false;

async function renderBilling() {
  const listEl = document.getElementById('billingInvoiceList');
  // Only show the skeleton on the very first load — a page revisit already
  // has content on screen, so re-clearing it here just causes a flash.
  if (!_billingLoadedOnce && listEl) listEl.innerHTML = skeletonCards(2);

  try {
    const [terms, feeItems] = await Promise.all([API.getTerms(), API.getFeeItems()]);
    _billingTerms    = terms || [];
    _billingFeeItems = feeItems || [];
    _billingLoadedOnce = true;
  } catch (e) {
    if (!_billingLoadedOnce && listEl) listEl.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  if ((!_billingTermId || !_billingTerms.some(t => t.id === _billingTermId)) && _billingTerms.length) {
    _billingTermId = (_billingTerms.find(t => t.is_current) || _billingTerms[0]).id;
  }

  _renderBillingFilters();
  await _loadAndRenderInvoices();
}

function _renderBillingFilters() {
  const classes = ['All', ...getClassList()];
  const clsEl    = document.getElementById('billingClassPicker');
  const statusEl = document.getElementById('billingStatusPicker');
  const termEl   = document.getElementById('billingTermPicker');
  if (!clsEl || !statusEl || !termEl) return;

  clsEl.innerHTML = classes.map(c =>
    `<button class="chip${c === _billingClass ? ' active' : ''}" data-value="${esc(c)}" onclick="selectBillingClass('${esc(c)}')">${esc(c === 'All' ? t('common.all') : c)}</button>`
  ).join('');

  statusEl.innerHTML = BILLING_STATUSES.map(s =>
    `<button class="chip${s === _billingStatus ? ' active' : ''}" data-value="${esc(s)}" onclick="selectBillingStatus('${esc(s)}')">${esc(tv('billStatus', s))}</button>`
  ).join('');

  termEl.innerHTML = _billingTerms.length
    ? `<div class="attend-class-select-wrap">
         <select class="attend-class-select" onchange="selectBillingTerm(this.value)">
           <option value=""${!_billingTermId ? ' selected' : ''}>${t('bill.allTerms')}</option>
           ${_billingTerms.map(tm => `<option value="${tm.id}"${tm.id === _billingTermId ? ' selected' : ''}>${esc(tm.term_name)}${tm.is_current ? ' ' + t('grades.current') : ''}</option>`).join('')}
         </select>
       </div>`
    : '';
}

window.selectBillingClass = function(cls) {
  _billingClass = cls;
  document.querySelectorAll('#billingClassPicker .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.value === cls));
  _loadAndRenderInvoices();
};

window.selectBillingStatus = function(status) {
  _billingStatus = status;
  document.querySelectorAll('#billingStatusPicker .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.value === status));
  _loadAndRenderInvoices();
};

window.selectBillingTerm = function(val) {
  _billingTermId = val ? Number(val) : null;
  _loadAndRenderInvoices();
};

async function _loadAndRenderInvoices() {
  const el = document.getElementById('billingInvoiceList');
  const summaryEl = document.getElementById('billingSummary');
  if (!el) return;

  el.innerHTML = skeletonCards(2);

  const filters = {
    class:   _billingClass !== 'All' ? _billingClass : null,
    status:  _billingStatus !== 'All' ? _billingStatus : null,
    term_id: _billingTermId,
  };

  try {
    const [invoices, summary] = await Promise.all([
      API.getInvoices(filters),
      API.getBillingSummary({ class: filters.class, term_id: filters.term_id }),
    ]);
    _billingInvoices = invoices;
    if (summaryEl) _renderBillingSummary(summaryEl, summary);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  if (!_billingInvoices.length) {
    el.innerHTML = `<div class="empty-state">${t('bill.none')}</div>`;
    return;
  }

  el.innerHTML = _billingInvoices.map(inv => `
    <div class="list-card" onclick="openInvoiceDetail(${inv.id})">
      <div class="card-row">
        <div class="card-info">
          <div class="card-name">${esc(inv.name_en || inv.student_id)} <span class="type-tag">${esc(inv.invoice_number || '')}</span></div>
          <div class="card-sub">${esc(t('bill.cardSub', { cls: inv.class || '', due: inv.due_date ? fmtDate(inv.due_date) : '—', total: inv.total_amount }))}</div>
        </div>
        <div class="card-actions">
          <span class="billing-status-badge billing-status-${esc((inv.display_status || inv.status).toLowerCase())}">${esc(tv('billStatus', inv.display_status || inv.status))}</span>
          ${inv.student_status === 'Pending' && inv.status === 'Paid' ? `<span class="billing-status-badge billing-ready-badge">${t('bill.ready')}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function _renderBillingSummary(el, s) {
  el.innerHTML = `
    <div class="billing-summary-row">
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('bill.billed')}</div>
        <div class="billing-summary-value">${esc(String(s.total_billed))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('bill.collected')}</div>
        <div class="billing-summary-value">${esc(String(s.total_collected))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('bill.outstanding')}</div>
        <div class="billing-summary-value">${esc(String(s.outstanding))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('enum.billStatus.Overdue')}</div>
        <div class="billing-summary-value${s.overdue_count > 0 ? ' danger' : ''}">${esc(String(s.overdue_count))}</div>
      </div>
    </div>`;
}

/* ─── New invoice ────────────────────────────────────────────────────── */

window.openNewInvoiceModal = function() {
  _newInvoiceStudent = null;
  _newInvoiceItems   = [];
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('bill.newTitle')}</h3>

      <label class="field-label">${t('bill.student')}</label>
      <button class="form-input billing-student-btn" id="niStudentBtn" onclick="_pickInvoiceStudent()">${t('bill.chooseStudent')}</button>

      <label class="field-label">${t('bill.termOptional')}</label>
      <div class="attend-class-select-wrap">
        <select class="attend-class-select" id="niTerm">
          <option value="">${t('bill.noTerm')}</option>
          ${_billingTerms.map(tm => `<option value="${tm.id}"${tm.is_current ? ' selected' : ''}>${esc(tm.term_name)}</option>`).join('')}
        </select>
      </div>

      <label class="field-label">${t('bill.dueDate')}</label>
      <input class="form-input" id="niDueDate" type="date">

      <label class="field-label">${t('bill.lineItems')}</label>
      <div id="niItemsList"></div>
      <button class="btn-pill-action ghost" onclick="_addInvoiceLineItem()">${t('bill.addLineItem')}</button>

      <div class="billing-total-row" id="niTotalRow">${t('bill.total', { n: 0 })}</div>

      <label class="field-label">${t('bill.notes')}</label>
      <input class="form-input" id="niNotes" placeholder="${esc(t('bill.optional'))}">

      <button class="btn-primary mt16" id="niSaveBtn" onclick="_saveNewInvoice()">${t('bill.createInvoice')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
  _renderInvoiceItemsList();
};

window._pickInvoiceStudent = function() {
  openStudentPicker({
    title: t('bill.pickerTitle'),
    onPick: (s) => {
      _newInvoiceStudent = s;
      const btn = document.getElementById('niStudentBtn');
      if (btn) { btn.textContent = `${s.name_en || s.name_local} (${s.class || '—'})`; btn.classList.add('picked'); }
    },
  });
};

window._addInvoiceLineItem = function(feeItem = null) {
  _newInvoiceItems.push({
    fee_item_id: feeItem?.id || null,
    description: feeItem?.name || '',
    amount:      feeItem?.default_amount ?? 0,
  });
  _renderInvoiceItemsList();
};

window._removeInvoiceLineItem = function(idx) {
  _newInvoiceItems.splice(idx, 1);
  _renderInvoiceItemsList();
};

window._updateInvoiceLineItem = function(idx, field, val) {
  if (!_newInvoiceItems[idx]) return;
  _newInvoiceItems[idx][field] = field === 'amount' ? (Number(val) || 0) : val;
  _renderInvoiceTotal();
};

function _renderInvoiceItemsList() {
  const el = document.getElementById('niItemsList');
  if (!el) return;

  const catalogRow = _billingFeeItems.length
    ? `<div class="attend-class-select-wrap mb8">
         <select class="attend-class-select" onchange="_pickCatalogItem(this)">
           <option value="">${t('bill.fromCatalog')}</option>
           ${_billingFeeItems.map(f => `<option value="${f.id}">${esc(f.name)} (${esc(String(f.default_amount))})</option>`).join('')}
         </select>
       </div>`
    : '';

  el.innerHTML = catalogRow + _newInvoiceItems.map((it, idx) => `
    <div class="billing-line-item" data-idx="${idx}">
      <input class="form-input" placeholder="${esc(t('bill.descPh'))}" value="${esc(it.description)}"
        oninput="_updateInvoiceLineItem(${idx},'description',this.value)">
      <input class="form-input billing-amount-input" type="number" min="0" value="${esc(String(it.amount))}"
        oninput="_updateInvoiceLineItem(${idx},'amount',this.value);_renderInvoiceTotal()">
      <button class="icon-btn-mini danger" onclick="_removeInvoiceLineItem(${idx})" title="${esc(t('picker.remove'))}">🗑</button>
    </div>
  `).join('');

  _renderInvoiceTotal();
}

window._pickCatalogItem = function(sel) {
  const id = Number(sel.value);
  sel.value = '';
  if (!id) return;
  const item = _billingFeeItems.find(f => f.id === id);
  if (item) window._addInvoiceLineItem(item);
};

function _renderInvoiceTotal() {
  const row = document.getElementById('niTotalRow');
  if (!row) return;
  const total = _newInvoiceItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  row.textContent = t('bill.total', { n: total });
}

window._saveNewInvoice = async function() {
  if (!_newInvoiceStudent) { showToast(t('bill.chooseStudentToast')); return; }
  const items = _newInvoiceItems.filter(it => it.description && it.description.trim());
  if (!items.length) { showToast(t('bill.needItem')); return; }

  const btn = document.getElementById('niSaveBtn');
  btn.disabled = true; btn.textContent = t('grades.creating');
  try {
    await API.createInvoice({
      student_id: _newInvoiceStudent.student_id,
      term_id:    Number(document.getElementById('niTerm').value) || null,
      due_date:   document.getElementById('niDueDate').value || null,
      notes:      document.getElementById('niNotes').value.trim() || null,
      items,
    });
    closeModal();
    showToast(t('bill.invoiceCreated'));
    await _loadAndRenderInvoices();
  } catch (e) {
    btn.disabled = false; btn.textContent = t('bill.createInvoice');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Invoice detail (line items + payments) ────────────────────────── */

window.openInvoiceDetail = async function(id) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto" id="invoiceDetailSheet">
      <div class="modal-handle"></div>
      <div id="invoiceDetailBody">${skeletonCards(2)}</div>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>
  `);
  await _loadInvoiceDetail(id);
};

async function _loadInvoiceDetail(id) {
  const body = document.getElementById('invoiceDetailBody');
  if (!body) return;
  let data;
  try {
    data = await API.getInvoiceDetail(id);
  } catch (e) {
    body.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  const inv = data.invoice, items = data.items || [], payments = data.payments || [];
  const balance = Number(inv.total_amount) - Number(inv.paid_amount);
  const isOverdue = ['Unpaid', 'Partial'].includes(inv.status) && inv.due_date && inv.due_date < new Date().toISOString().slice(0,10);
  const displayStatus = isOverdue ? 'Overdue' : inv.status;

  body.innerHTML = `
    <h3 class="modal-title mb0">${esc(inv.name_en || inv.student_id)}</h3>
    <p class="modal-subtitle">${esc(inv.class || '')} · ${esc(inv.invoice_number || '')}
      <span class="billing-status-badge billing-status-${esc(displayStatus.toLowerCase())}">${esc(tv('billStatus', displayStatus))}</span>
    </p>

    <div class="billing-detail-items">
      ${items.map(it => `
        <div class="billing-detail-row">
          <span>${esc(it.description)}</span>
          <span>${esc(String(it.amount))}</span>
        </div>
      `).join('')}
      <div class="billing-detail-row total">
        <span>${t('bill.rowTotal')}</span><span>${esc(String(inv.total_amount))}</span>
      </div>
      <div class="billing-detail-row">
        <span>${t('bill.rowPaid')}</span><span>${esc(String(inv.paid_amount))}</span>
      </div>
      <div class="billing-detail-row balance${balance > 0 ? ' danger' : ''}">
        <span>${t('bill.rowBalance')}</span><span>${esc(String(balance))}</span>
      </div>
    </div>

    ${inv.notes ? `<p class="billing-notes">${esc(inv.notes)}</p>` : ''}

    <div class="billing-payments-section">
      <div class="billing-section-title">${t('bill.payments')}</div>
      ${payments.length ? payments.map(p => `
        <div class="billing-payment-row">
          <span>${esc(fmtDate(p.payment_date))} · ${esc(tv('payMethod', p.method))}</span>
          <span>${esc(String(p.amount))}</span>
          <button class="icon-btn-mini danger" onclick="_confirmDeletePayment(${p.id}, ${inv.id})" title="${esc(t('picker.remove'))}">🗑</button>
        </div>
      `).join('') : `<div class="billing-payments-empty">${t('bill.noPayments')}</div>`}
    </div>

    ${inv.student_status === 'Pending' ? (inv.status === 'Paid' ? `
      <div class="billing-section-title mt16">${t('bill.enrollment')}</div>
      <p class="billing-notes">${t('bill.feePaidPending', { name: esc(inv.name_en || inv.student_id) })}</p>
      <button class="btn-primary" id="btnMakeActive" onclick="_makeStudentActive(${inv.id}, '${esc(inv.student_id)}')">${t('bill.makeActive')}</button>
    ` : `
      <p class="billing-notes">${t('bill.pendingNote')}</p>
    `) : ''}

    ${balance > 0 ? `<button class="btn-primary mt16" onclick="_openRecordPayment(${inv.id}, ${balance})">${t('bill.recordPayment')}</button>` : ''}
    <button class="btn-secondary" onclick="_confirmDeleteInvoice(${inv.id})">${t('bill.deleteInvoice')}</button>
  `;
}

window._makeStudentActive = async function(invoiceId, studentId) {
  const btn = document.getElementById('btnMakeActive');
  if (btn) { btn.disabled = true; btn.textContent = t('bill.activating'); }
  try {
    await API.activateStudent(studentId);
    showToast(t('bill.activated'));
    if (window.APP && typeof API.getStudents === 'function') {
      window.APP.students = await API.getStudents().catch(() => window.APP.students);
      if (typeof renderStudents === 'function') { try { renderStudents(); } catch (e) {} }
    }
    await _loadInvoiceDetail(invoiceId);
    await _loadAndRenderInvoices();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = t('bill.makeActive'); }
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._openRecordPayment = function(invoiceId, balance) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:360px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('bill.recordPayment')}</h3>
      <label class="field-label">${esc(t('bill.amountBalance', { n: balance }))}</label>
      <input class="form-input" id="rpAmount" type="number" min="0" max="${esc(String(balance))}" value="${esc(String(balance))}">
      <label class="field-label">${t('grades.date')}</label>
      <input class="form-input" id="rpDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
      <label class="field-label">${t('bill.method')}</label>
      <div class="pill-group" id="rpMethodPills">
        ${['Cash', 'Bank Transfer', 'Mobile', 'Other'].map((m, i) =>
          `<button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${m}" onclick="togglePill(this,'rpMethodPills')">${esc(tv('payMethod', m))}</button>`
        ).join('')}
      </div>
      <label class="field-label">${t('bill.notes')}</label>
      <input class="form-input" id="rpNotes" placeholder="${esc(t('bill.optional'))}">
      <button class="btn-primary mt16" id="rpSaveBtn" onclick="_saveRecordPayment(${invoiceId})">${t('bill.savePayment')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._saveRecordPayment = async function(invoiceId) {
  const amount = Number(document.getElementById('rpAmount').value);
  if (!amount || amount <= 0) { showToast(t('bill.validAmount')); return; }

  const btn = document.getElementById('rpSaveBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    await API.recordPayment(invoiceId, {
      amount,
      payment_date: document.getElementById('rpDate').value || null,
      method: document.querySelector('#rpMethodPills .pill.active')?.dataset.value || 'Cash',
      notes: document.getElementById('rpNotes').value.trim() || null,
    });
    await _loadInvoiceDetail(invoiceId);
    await _loadAndRenderInvoices();
    closeModal();
    showToast(t('bill.paymentRecorded'));
  } catch (e) {
    btn.disabled = false; btn.textContent = t('bill.savePayment');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._confirmDeletePayment = function(paymentId, invoiceId) {
  showConfirm(
    t('bill.removePayTitle'),
    t('bill.removePayBody'),
    t('picker.remove'),
    async () => {
      try {
        await API.deletePayment(paymentId);
        showToast(t('bill.removedToast'));
        await _loadInvoiceDetail(invoiceId);
        await _loadAndRenderInvoices();
      } catch (e) {
        showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
      }
    }
  );
};

window._confirmDeleteInvoice = function(id) {
  showConfirm(
    t('bill.delInvTitle'),
    t('bill.delInvBody'),
    t('btn.delete'),
    async () => {
      try {
        await API.deleteInvoice(id);
        closeModal();
        showToast(t('common.deleted'));
        await _loadAndRenderInvoices();
      } catch (e) {
        showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
      }
    }
  );
};

/* ─── Fee items catalog (manage from Billing page) ─────────────────────── */

window.openFeeItemsManager = function() {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('billing.feeItems')}</h3>
      <div id="feeItemsList"></div>
      <button class="btn-pill-action ghost" onclick="_openAddFeeItem()">${t('bill.addFeeItem')}</button>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>
  `);
  _renderFeeItemsList();
};

function _renderFeeItemsList() {
  const el = document.getElementById('feeItemsList');
  if (!el) return;
  if (!_billingFeeItems.length) {
    el.innerHTML = `<div class="empty-state">${t('bill.noFeeItems')}</div>`;
    return;
  }
  el.innerHTML = _billingFeeItems.map(f => `
    <div class="list-card">
      <div class="card-row">
        <div class="card-info">
          <div class="card-name">${esc(f.name)} <span class="type-tag">${esc(tv('feeCategory', f.category))}</span></div>
          <div class="card-sub">${esc(String(f.default_amount))}${f.is_recurring ? ' · ' + t('bill.recurring') : ''}</div>
        </div>
        <div class="card-actions">
          <button class="icon-btn-mini danger" onclick="_confirmDeleteFeeItem(${f.id})" title="${esc(t('btn.delete'))}">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

window._openAddFeeItem = function() {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:360px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('bill.addFeeTitle')}</h3>
      <label class="field-label">${t('bill.name')}</label>
      <input class="form-input" id="fiName" placeholder="${esc(t('bill.namePh'))}">
      <label class="field-label">${t('bill.category')}</label>
      <div class="pill-group" id="fiCategoryPills">
        ${['Tuition', 'Transport', 'Meals', 'Uniform', 'Books', 'Activity', 'Other'].map((c, i) =>
          `<button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${c}" onclick="togglePill(this,'fiCategoryPills')">${esc(tv('feeCategory', c))}</button>`
        ).join('')}
      </div>
      <label class="field-label">${t('bill.defaultAmount')}</label>
      <input class="form-input" id="fiAmount" type="number" min="0" value="0">
      <button class="btn-primary mt16" id="fiSaveBtn" onclick="_saveNewFeeItem()">${t('common.add')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._saveNewFeeItem = async function() {
  const name = document.getElementById('fiName').value.trim();
  if (!name) { showToast(t('bill.enterName')); return; }

  const btn = document.getElementById('fiSaveBtn');
  btn.disabled = true; btn.textContent = t('subject.adding');
  try {
    await API.addFeeItem({
      name,
      category: document.querySelector('#fiCategoryPills .pill.active')?.dataset.value || 'Other',
      default_amount: Number(document.getElementById('fiAmount').value) || 0,
      is_recurring: true,
    });
    _billingFeeItems = await API.getFeeItems();
    _renderFeeItemsList(); // refresh the manager sheet underneath, in place
    closeModal();           // pop just this "Add fee item" layer
    showToast(t('bill.feeAdded'));
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.add');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._confirmDeleteFeeItem = function(id) {
  showConfirm(
    t('bill.delFeeTitle'),
    t('bill.delFeeBody'),
    t('btn.delete'),
    async () => {
      try {
        await API.deleteFeeItem(id);
        _billingFeeItems = await API.getFeeItems();
        showToast(t('common.deleted'));
        _renderFeeItemsList();
      } catch (e) {
        showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
      }
    }
  );
};
