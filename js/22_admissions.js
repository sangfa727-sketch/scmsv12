/**
 * SCMS v11 — 22_admissions.js
 * Admissions: prospective-student applications, tracked through a pipeline
 * (Applied → Interview Scheduled/Done → Accepted/Waitlisted/Rejected →
 * Enrolled or Withdrawn).
 *
 * "Enrolled" is reached via the convert-to-student action, which creates a
 * real `students` row with status='Pending' — deliberately hidden from
 * rpc_get_students (and so from the Students list) until the registration
 * fee is billed and paid:
 *
 *   Accepted → [Enroll as student] → students row (Pending, has a real
 *   student_id / "ID card") → [Create registration invoice] → parent pays
 *   (Billing page) → [Make active student on the paid invoice] → status='Active' → official student,
 *   visible in the Students list.
 *
 * The whole gate reuses the existing, unmodified billing RPCs
 * (rpc_create_invoice / rpc_get_invoice_detail) — this file only remembers
 * which invoice to watch (admissions.registration_invoice_id) and flips the
 * student to Active once it's Paid.
 *
 * All detail/edit/interview/convert/billing views render into a SINGLE
 * modal body (#admDetailBody) that gets its innerHTML swapped — never a
 * second stacked openModal() call — so repeated view↔edit↔cancel cycles
 * don't pile up orphaned modal layers.
 *
 * Web only for now — this is a new feature with no n8n/Telegram equivalent
 * yet, same as Grading & Assessment / Billing.
 */

'use strict';

let _admStatus     = 'All';
let _admClass      = 'All';
let _admissionsAll = [];
let _admPendingPhotoFile   = null; // File picked in the New/Edit applicant form, uploaded on save
let _admRemovePhotoRequested = false;

const ADM_STATUSES = [
  'All', 'Applied', 'Interview Scheduled', 'Interview Done',
  'Accepted', 'Waitlisted', 'Rejected', 'Enrolled', 'Withdrawn',
];

// Statuses reachable from each status via the pipeline buttons in the
// detail view (Enrolled is excluded — that only happens via convert).
const ADM_NEXT_STATUSES = {
  'Applied':              ['Interview Scheduled', 'Accepted', 'Rejected', 'Withdrawn'],
  'Interview Scheduled':  ['Interview Done', 'Rejected', 'Withdrawn'],
  'Interview Done':       ['Accepted', 'Waitlisted', 'Rejected', 'Withdrawn'],
  'Waitlisted':           ['Accepted', 'Rejected', 'Withdrawn'],
  'Accepted':             ['Withdrawn'],
  'Rejected':             ['Applied'],
  'Withdrawn':            ['Applied'],
  'Enrolled':             [],
};

let _admissionsLoadedOnce = false;

async function renderAdmissions() {
  const listEl = document.getElementById('admissionsList');
  if (_admissionsLoadedOnce) {
    // Already have data from a previous visit — show it instantly (no
    // skeleton flash) while refreshing quietly in the background.
    _renderAdmissionsFilters();
    _renderAdmissionsSummary();
    _renderAdmissionsList();
  } else if (listEl) {
    listEl.innerHTML = skeletonCards(2);
  }

  try {
    _admissionsAll = await API.getAdmissions();
    _admissionsLoadedOnce = true;
  } catch (e) {
    if (!_admissionsLoadedOnce && listEl) listEl.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  _renderAdmissionsFilters();
  _renderAdmissionsSummary();
  _renderAdmissionsList();
}

function _renderAdmissionsFilters() {
  const classes = ['All', ...getClassList()];
  const clsEl    = document.getElementById('admissionsClassPicker');
  const statusEl = document.getElementById('admissionsStatusPicker');
  if (!clsEl || !statusEl) return;

  clsEl.innerHTML = classes.map(c =>
    `<button class="chip${c === _admClass ? ' active' : ''}" data-value="${esc(c)}" onclick="selectAdmClass('${esc(c)}')">${esc(c === 'All' ? t('common.all') : c)}</button>`
  ).join('');

  statusEl.innerHTML = ADM_STATUSES.map(s =>
    `<button class="chip${s === _admStatus ? ' active' : ''}" data-value="${esc(s)}" onclick="selectAdmStatus('${esc(s)}')">${esc(tv('admStatus', s))}</button>`
  ).join('');
}

window.selectAdmClass = function(cls) {
  _admClass = cls;
  document.querySelectorAll('#admissionsClassPicker .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.value === cls));
  _renderAdmissionsList();
};

window.selectAdmStatus = function(status) {
  _admStatus = status;
  document.querySelectorAll('#admissionsStatusPicker .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.value === status));
  _renderAdmissionsList();
};

function _filteredAdmissions() {
  return _admissionsAll.filter(a =>
    (_admStatus === 'All' || a.status === _admStatus) &&
    (_admClass  === 'All' || (a.desired_class || '') === _admClass)
  );
}

function _renderAdmissionsSummary() {
  const el = document.getElementById('admissionsSummary');
  if (!el) return;
  const open      = _admissionsAll.filter(a => !['Enrolled', 'Rejected', 'Withdrawn'].includes(a.status)).length;
  const accepted  = _admissionsAll.filter(a => a.status === 'Accepted').length;
  const enrolled  = _admissionsAll.filter(a => a.status === 'Enrolled').length;
  el.innerHTML = `
    <div class="billing-summary-row">
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('adm.total')}</div>
        <div class="billing-summary-value">${esc(String(_admissionsAll.length))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('adm.inProgress')}</div>
        <div class="billing-summary-value">${esc(String(open))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('enum.admStatus.Accepted')}</div>
        <div class="billing-summary-value">${esc(String(accepted))}</div>
      </div>
      <div class="billing-summary-cell">
        <div class="billing-summary-label">${t('enum.admStatus.Enrolled')}</div>
        <div class="billing-summary-value">${esc(String(enrolled))}</div>
      </div>
    </div>`;
}

let _admSelected = new Set();

function _renderAdmissionsList() {
  const el = document.getElementById('admissionsList');
  if (!el) return;

  const rows = _filteredAdmissions();

  // Drop selections that fell out of view (filtered out / bulk-acted-on already).
  const visibleIds = new Set(rows.map(a => a.id));
  Array.from(_admSelected).forEach(id => { if (!visibleIds.has(id)) _admSelected.delete(id); });

  if (!rows.length) {
    el.innerHTML = `<div class="empty-state">${t('adm.none')}</div>`;
    return;
  }

  el.innerHTML = _admSelectionBarHtml(rows) + rows.map(a => `
    <div class="list-card" onclick="openAdmissionDetail(${a.id})">
      <div class="card-row">
        <label class="adm-select-checkbox" onclick="event.stopPropagation()">
          <input type="checkbox" ${_admSelected.has(a.id) ? 'checked' : ''} onchange="_toggleAdmSelect(${a.id}, this.checked)">
        </label>
        <div class="card-info">
          <div class="card-name">${esc(a.applicant_name_en)} ${a.desired_class ? `<span class="type-tag">${esc(a.desired_class)}</span>` : ''}</div>
          <div class="card-sub">${esc(a.parent_name || t('adm.noParent'))} · ${esc(t('adm.appliedOn', { date: fmtDate(a.application_date) }))}</div>
        </div>
        <div class="card-actions">
          <span class="adm-status-badge adm-status-${_admStatusSlug(a.status)}">${esc(tv('admStatus', a.status))}</span>
          ${_admQuickMoveHtml(a)}
        </div>
      </div>
    </div>
  `).join('');
}

// A small "Move to ▾" dropdown in the card's own corner, so common status
// changes (Accept/Reject/Withdraw/etc.) don't require opening the full
// detail sheet. "Interview Scheduled" is left out here — it needs a date,
// so that one still goes through the detail view.
function _admQuickMoveHtml(a) {
  const options = (ADM_NEXT_STATUSES[a.status] || []).filter(s => s !== 'Interview Scheduled');
  if (!options.length) return '';
  return `
    <details class="adm-move-menu" onclick="event.stopPropagation()" ontoggle="_closeOtherAdmMoveMenus(this)">
      <summary>${t('adm.moveTo')}</summary>
      <div class="adm-move-options">
        ${options.map(s => `<button type="button" onclick="_quickMoveAdmission(${a.id}, '${esc(s)}', this)">${esc(tv('admStatus', s))}</button>`).join('')}
      </div>
    </details>`;
}

function _closeOtherAdmMoveMenus(openedEl) {
  if (!openedEl.open) return;
  document.querySelectorAll('.adm-move-menu[open]').forEach(d => { if (d !== openedEl) d.removeAttribute('open'); });
}

window._quickMoveAdmission = async function(id, status, btn) {
  const details = btn.closest('details');
  if (details) details.removeAttribute('open');
  try {
    await API.updateAdmissionStatus(id, status);
    showToast(t('adm.movedTo', { status: tv('admStatus', status) }));
    await renderAdmissions();
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

// Bulk-selection toolbar, shown above the list only once something is
// checked. Statuses offered are the ones every selected applicant can
// reach in common ("Move to Accepted" only appears if ALL selected can go
// there); "Enroll" appears only when every selected item is Accepted and
// not already converted — each is enrolled with ITS OWN desired_class, so
// a teacher accepting/enrolling a whole batch of walk-ins doesn't have to
// open each applicant individually.
function _admSelectionBarHtml(rows) {
  const n = _admSelected.size;
  if (!n) return '';
  const selectedRows = rows.filter(a => _admSelected.has(a.id));

  const statusSets = selectedRows.map(a => new Set((ADM_NEXT_STATUSES[a.status] || []).filter(s => s !== 'Interview Scheduled')));
  const common = statusSets.length
    ? [...statusSets[0]].filter(s => statusSets.every(set => set.has(s)))
    : [];
  const canBulkEnroll = selectedRows.length > 0 && selectedRows.every(a => a.status === 'Accepted' && !a.converted_student_id);

  return `
    <div class="adm-selection-bar">
      <strong>${t('adm.selected', { n })}</strong>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${common.map(s => `<button type="button" class="pill" onclick="_bulkMoveAdmissions('${esc(s)}')">${esc(tv('admStatus', s))}</button>`).join('')}
        ${canBulkEnroll ? `<button type="button" class="pill" onclick="_bulkEnrollAdmissions()">${t('adm.enrollOwn')}</button>` : ''}
        <button type="button" class="pill" onclick="_clearAdmSelection()">${t('adm.clear')}</button>
      </div>
    </div>`;
}

window._toggleAdmSelect = function(id, checked) {
  if (checked) _admSelected.add(id); else _admSelected.delete(id);
  _renderAdmissionsList();
};

window._clearAdmSelection = function() {
  _admSelected.clear();
  _renderAdmissionsList();
};

window._bulkMoveAdmissions = async function(status) {
  const ids = Array.from(_admSelected);
  if (!ids.length) return;
  showToast(t('adm.bulkMoving', { n: ids.length, status: tv('admStatus', status) }));
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await API.updateAdmissionStatus(id, status); ok++; } catch (e) { fail++; }
  }
  _admSelected.clear();
  showToast(t('adm.bulkMoved', { ok, status: tv('admStatus', status) }) + (fail ? t('adm.failedN', { n: fail }) : ''));
  await renderAdmissions();
};

window._bulkEnrollAdmissions = async function() {
  const ids = Array.from(_admSelected);
  if (!ids.length) return;

  const toEnroll = ids.filter(id => {
    const a = _admissionsAll.find(x => x.id === id);
    return a && a.desired_class;
  });
  const skipped = ids.length - toEnroll.length;
  if (!toEnroll.length) { showToast(t('adm.noClassSet')); return; }

  showToast(t('adm.enrolling', { n: toEnroll.length }) + (skipped ? t('adm.skipped', { n: skipped }) : ''));
  let ok = 0, fail = 0;
  for (const id of toEnroll) {
    const a = _admissionsAll.find(x => x.id === id);
    try {
      await API.convertAdmissionToStudent(id, { class: a.desired_class, status: 'Pending' });
      ok++;
    } catch (e) { fail++; }
  }
  _admSelected.clear();
  showToast(t('adm.enrolledPending', { ok }) + (fail ? t('adm.failedN', { n: fail }) : ''));
  await renderAdmissions();
};

function _admStatusSlug(s) {
  return String(s).toLowerCase().replace(/\s+/g, '-');
}

/* ─── New applicant ──────────────────────────────────────────────────── */

window.openNewAdmissionModal = function() {
  _admPendingPhotoFile = null;
  _admRemovePhotoRequested = false;
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('adm.newTitle')}</h3>

      <div class="stu-photo-picker" onclick="document.getElementById('admPhotoInput').click()">
        <div class="stu-photo-circle" id="admPhotoPreview" style="background:${homeColorHex(null)}">${avatarContent({})}</div>
        <div class="stu-photo-edit-badge">📷</div>
      </div>
      <input type="file" id="admPhotoInput" accept="image/*" style="display:none" onchange="_onAdmPhotoPicked(this)">
      <button type="button" class="stu-photo-remove-link" id="admPhotoRemoveBtn" onclick="_removeAdmPhoto()" style="display:none">${t('students.form.removePhoto')}</button>

      <label class="field-label">${t('adm.nameEn')}</label>
      <input class="form-input" id="naNameEn" placeholder="${esc(t('adm.fullName'))}">
      <label class="field-label">${t('adm.nameLocalOpt')}</label>
      <input class="form-input" id="naNameLocal" placeholder="${esc(t('adm.optional'))}">

      <label class="field-label">${t('adm.dob')}</label>
      <input class="form-input" id="naDob" type="date">

      <label class="field-label">${t('adm.gender')}</label>
      <div class="pill-group" id="naGenderPills">
        ${['Male', 'Female', 'Other'].map((g, i) =>
          `<button type="button" class="pill${i === 0 ? ' active' : ''}" data-value="${g}" onclick="togglePill(this,'naGenderPills')">${esc(tv('gender', g))}</button>`
        ).join('')}
      </div>

      <label class="field-label">${t('adm.desiredClass')}</label>
      <button type="button" class="form-picker-trigger" id="naClassBtn" onclick="pickClassValue('naClass')">
        <span class="form-picker-value" id="naClass_label">${t('students.form.selectClass')}</span>
        <svg class="form-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <input type="hidden" id="naClass" value="">

      <label class="field-label">${t('adm.parentName')}</label>
      <input class="form-input" id="naParentName" placeholder="${esc(t('adm.optional'))}">
      <label class="field-label">${t('adm.parentPhone')}</label>
      <input class="form-input" id="naParentPhone" placeholder="${esc(t('adm.optional'))}" type="tel">
      <label class="field-label">${t('adm.parentEmail')}</label>
      <input class="form-input" id="naParentEmail" placeholder="${esc(t('adm.optional'))}" type="email">

      <label class="field-label">${t('adm.source')}</label>
      <input class="form-input" id="naSource" placeholder="${esc(t('adm.sourcePh'))}">

      <label class="field-label">${t('adm.notes')}</label>
      <input class="form-input" id="naNotes" placeholder="${esc(t('adm.optional'))}">

      <button class="btn-primary mt16" id="naSaveBtn" onclick="_saveNewAdmission()">${t('adm.add')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._onAdmPhotoPicked = function(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast(t('students.toast.imageOnly')); return; }
  if (file.size > 20 * 1024 * 1024) { showToast(t('students.toast.imageTooBig')); return; }

  _admPendingPhotoFile = file;
  _admRemovePhotoRequested = false;
  const reader = new FileReader();
  reader.onload = () => {
    const preview = document.getElementById('admPhotoPreview');
    if (preview) preview.innerHTML = `<img src="${reader.result}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">`;
  };
  const removeBtn = document.getElementById('admPhotoRemoveBtn');
  if (removeBtn) removeBtn.style.display = '';
  reader.readAsDataURL(file);
};

window._removeAdmPhoto = function() {
  _admPendingPhotoFile = null;
  _admRemovePhotoRequested = true;
  const preview = document.getElementById('admPhotoPreview');
  if (preview) preview.innerHTML = avatarContent({ gender: document.querySelector('#naGenderPills .pill.active')?.dataset.value });
  const removeBtn = document.getElementById('admPhotoRemoveBtn');
  if (removeBtn) removeBtn.style.display = 'none';
  const input = document.getElementById('admPhotoInput');
  if (input) input.value = '';
};

window._saveNewAdmission = async function() {
  const nameEn = document.getElementById('naNameEn').value.trim();
  if (!nameEn) { showToast(t('adm.enterName')); return; }

  const parentEmail = document.getElementById('naParentEmail').value.trim();
  if (parentEmail && !isValidEmail(parentEmail)) { showToast(t('adm.validEmail')); return; }

  const btn = document.getElementById('naSaveBtn');
  btn.disabled = true; btn.textContent = t('subject.adding');
  try {
    const res = await API.createAdmission({
      applicant_name_en:    nameEn,
      applicant_name_local: document.getElementById('naNameLocal').value.trim() || null,
      date_of_birth:        document.getElementById('naDob').value || null,
      gender:                document.querySelector('#naGenderPills .pill.active')?.dataset.value || null,
      desired_class:        document.getElementById('naClass').value.trim() || null,
      parent_name:          document.getElementById('naParentName').value.trim() || null,
      parent_phone:         document.getElementById('naParentPhone').value.trim() || null,
      parent_email:         parentEmail || null,
      source:               document.getElementById('naSource').value.trim() || null,
      notes:                document.getElementById('naNotes').value.trim() || null,
    });

    if (_admPendingPhotoFile && res.admission?.id) {
      try {
        const url = await API.uploadAdmissionPhoto(res.admission.id, _admPendingPhotoFile);
        await API.setAdmissionPhoto(res.admission.id, url);
      } catch (photoErr) {
        showToast(t('adm.addedPhotoFail', { err: photoErr.message || t('common.error') }));
      }
      _admPendingPhotoFile = null;
    }

    closeModal();
    showToast(t('adm.added'));
    await renderAdmissions();
  } catch (e) {
    btn.disabled = false; btn.textContent = t('adm.add');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Detail (single modal — all sub-views swap #admDetailBody in place) ── */

window.openAdmissionDetail = function(id) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div id="admDetailBody">${skeletonCards(1)}</div>
    </div>
  `);
  _loadAdmissionDetail(id);
};

async function _loadAdmissionDetail(id) {
  const el = document.getElementById('admDetailBody');
  if (!el) return;
  // Don't wipe to a skeleton here — this runs both on first open (the modal
  // already shows a skeleton until this resolves) and as a quiet refresh
  // after an action (Cancel, Save, status change), where clearing existing
  // content first just causes a visible blank-box flash for no reason.
  try {
    const res = await API.getAdmissionDetail(id);
    await _renderAdmDetailView(res.admission);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
  }
}

async function _renderAdmDetailView(a) {
  const el = document.getElementById('admDetailBody');
  if (!el) return;

  // If already converted, fetch the linked student (Pending or Active) and,
  // if a registration invoice is linked, its current status — in parallel,
  // so the billing-gate step shows without two sequential round trips.
  const [student, invoice] = await Promise.all([
    a.converted_student_id
      ? API.getStudentById(a.converted_student_id).then(r => r.student).catch(() => null)
      : Promise.resolve(null),
    a.registration_invoice_id
      ? API.getInvoiceDetail(a.registration_invoice_id).then(r => r.invoice).catch(() => null)
      : Promise.resolve(null),
  ]);

  el.innerHTML = _admDetailHtml(a, student, invoice);
}

function _admDetailHtml(a, student, invoice) {
  const nextStatuses = ADM_NEXT_STATUSES[a.status] || [];
  const photoHtml = avatarContent({ photo_url: a.applicant_photo_url, gender: a.gender, name_en: a.applicant_name_en });

  return `
    <div class="stu-photo-circle" style="margin:0 auto 10px;background:${homeColorHex(null)}">${photoHtml}</div>
    <h3 class="modal-title mb0" style="text-align:center">${esc(a.applicant_name_en)}</h3>
    <p style="text-align:center"><span class="adm-status-badge adm-status-${_admStatusSlug(a.status)}">${esc(tv('admStatus', a.status))}</span></p>

    <div class="billing-detail-items">
      <div class="billing-detail-row"><span>${t('adm.rowLocal')}</span><span>${esc(a.applicant_name_local || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('adm.dob')}</span><span>${a.date_of_birth ? esc(fmtDate(a.date_of_birth)) : '—'}</span></div>
      <div class="billing-detail-row"><span>${t('adm.gender')}</span><span>${esc(a.gender ? tv('gender', a.gender) : '—')}</span></div>
      <div class="billing-detail-row"><span>${t('adm.desiredClass')}</span><span>${esc(a.desired_class || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('adm.rowParent')}</span><span>${esc(a.parent_name || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('adm.rowPhone')}</span><span>${esc(a.parent_phone || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('adm.rowEmail')}</span><span>${esc(a.parent_email || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('adm.rowApplied')}</span><span>${esc(fmtDate(a.application_date))}</span></div>
      ${a.interview_date ? `<div class="billing-detail-row"><span>${t('adm.rowInterview')}</span><span>${esc(fmtDate(a.interview_date))}</span></div>` : ''}
      <div class="billing-detail-row"><span>${t('adm.source')}</span><span>${esc(a.source || '—')}</span></div>
    </div>
    ${a.notes ? `<p class="billing-notes">${esc(a.notes)}</p>` : ''}

    ${nextStatuses.length ? `
      <div class="billing-section-title mt16">${t('adm.moveToTitle')}</div>
      <div class="pill-group">
        ${nextStatuses.map(s => `<button type="button" class="pill" onclick="_moveAdmissionStatus(${a.id}, '${esc(s)}')">${esc(tv('admStatus', s))}</button>`).join('')}
      </div>
    ` : ''}

    ${a.status === 'Accepted' && !a.converted_student_id ? `
      <button class="btn-primary mt16" onclick="_showConvertAdmissionView(${a.id}, '${esc((a.desired_class || '').replace(/'/g, "\\'"))}')">${t('adm.enrollBtn')}</button>
    ` : ''}

    ${student ? _admEnrollmentSectionHtml(a, student, invoice) : ''}

    <button class="btn-secondary mt16" onclick="_showEditAdmissionView(${a.id})">${t('adm.editDetails')}</button>
    <button class="btn-secondary" onclick="_confirmDeleteAdmission(${a.id})">${t('adm.deleteApplicant')}</button>
  `;
}

function _admEnrollmentSectionHtml(a, student, invoice) {
  if (student.status === 'Active') {
    return `
      <div class="billing-section-title mt16">${t('bill.enrollment')}</div>
      <p class="billing-notes">${t('adm.officialStudent', { id: esc(student.student_id), cls: esc(student.class || '—') })}</p>
      <button class="btn-secondary" onclick="showStudentIdCard('${esc(student.student_id)}')">🪪 ${t('idCard.title')}</button>`;
  }

  // Pending — not yet official.
  let body = `
    <div class="billing-section-title mt16">${t('bill.enrollment')}</div>
    <p class="billing-notes">${t('adm.pendingCreated', { id: esc(student.student_id) })}</p>`;

  if (!invoice) {
    body += `<button class="btn-primary" onclick="_showRegistrationInvoiceView(${a.id}, '${esc(student.student_id)}')">${t('adm.createRegInvoice')}</button>`;
  } else {
    const balance = Number(invoice.total_amount) - Number(invoice.paid_amount);
    if (invoice.status === 'Paid') {
      body += `
        <p class="billing-notes">${t('adm.regPaid', { no: esc(invoice.invoice_number || '') })}</p>
        <button class="btn-primary" onclick="closeModal();goToPage('billing')">${t('adm.goBilling')}</button>`;
    } else {
      body += `
        <p class="billing-notes">${t('adm.regUnpaid', { no: esc(invoice.invoice_number || ''), status: esc(tv('billStatus', invoice.status)), bal: esc(String(balance)) })}</p>
        <button class="btn-secondary" onclick="closeModal();goToPage('billing')">${t('adm.goBilling')}</button>`;
    }
  }
  return body;
}

window._moveAdmissionStatus = async function(id, status) {
  if (status === 'Interview Scheduled') {
    _showInterviewDateView(id);
    return;
  }
  try {
    await API.updateAdmissionStatus(id, status);
    showToast(t('adm.movedTo', { status: tv('admStatus', status) }));
    await _loadAdmissionDetail(id);
    await renderAdmissions();
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

function _showInterviewDateView(id) {
  const el = document.getElementById('admDetailBody');
  if (!el) return;
  el.innerHTML = `
    <h3 class="modal-title">${t('adm.scheduleTitle')}</h3>
    <label class="field-label">${t('adm.interviewDate')}</label>
    <input class="form-input" id="admInterviewDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
    <button class="btn-primary mt16" onclick="_saveInterviewDate(${id})">${t('btn.save')}</button>
    <button class="btn-secondary" onclick="_loadAdmissionDetail(${id})">${t('common.cancel')}</button>
  `;
}

window._saveInterviewDate = async function(id) {
  const date = document.getElementById('admInterviewDate').value || null;
  try {
    await API.updateAdmissionStatus(id, 'Interview Scheduled', { interview_date: date });
    showToast(t('adm.interviewScheduled'));
    await _loadAdmissionDetail(id);
    await renderAdmissions();
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._showEditAdmissionView = async function(id) {
  const el = document.getElementById('admDetailBody');
  if (!el) return;
  el.innerHTML = skeletonCards(1);

  let a;
  try {
    a = (await API.getAdmissionDetail(id)).admission;
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  _admPendingPhotoFile = null;
  _admRemovePhotoRequested = false;

  el.innerHTML = `
    <h3 class="modal-title">${t('adm.editTitle')}</h3>

    <div class="stu-photo-picker" onclick="document.getElementById('admPhotoInput').click()">
      <div class="stu-photo-circle" id="admPhotoPreview" style="background:${homeColorHex(null)}">${avatarContent({ photo_url: a.applicant_photo_url, gender: a.gender, name_en: a.applicant_name_en })}</div>
      <div class="stu-photo-edit-badge">📷</div>
    </div>
    <input type="file" id="admPhotoInput" accept="image/*" style="display:none" onchange="_onAdmPhotoPicked(this)">
    <button type="button" class="stu-photo-remove-link" id="admPhotoRemoveBtn" onclick="_removeAdmPhoto()" style="${a.applicant_photo_url ? '' : 'display:none'}">${t('students.form.removePhoto')}</button>

    <label class="field-label">${t('adm.nameEn')}</label>
    <input class="form-input" id="eaNameEn" value="${esc(a.applicant_name_en)}">
    <label class="field-label">${t('adm.nameLocal')}</label>
    <input class="form-input" id="eaNameLocal" value="${esc(a.applicant_name_local || '')}">
    <label class="field-label">${t('adm.dob')}</label>
    <input class="form-input" id="eaDob" type="date" value="${a.date_of_birth || ''}">
    <label class="field-label">${t('adm.desiredClass')}</label>
    <button type="button" class="form-picker-trigger" id="eaClassBtn" onclick="pickClassValue('eaClass')">
      <span class="form-picker-value" id="eaClass_label">${a.desired_class ? esc(a.desired_class) : t('students.form.selectClass')}</span>
      <svg class="form-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <input type="hidden" id="eaClass" value="${esc(a.desired_class || '')}">
    <label class="field-label">${t('adm.parentName')}</label>
    <input class="form-input" id="eaParentName" value="${esc(a.parent_name || '')}">
    <label class="field-label">${t('adm.parentPhone')}</label>
    <input class="form-input" id="eaParentPhone" value="${esc(a.parent_phone || '')}">
    <label class="field-label">${t('adm.parentEmail')}</label>
    <input class="form-input" id="eaParentEmail" value="${esc(a.parent_email || '')}">
    <label class="field-label">${t('adm.source')}</label>
    <input class="form-input" id="eaSource" value="${esc(a.source || '')}">
    <label class="field-label">${t('adm.notes')}</label>
    <input class="form-input" id="eaNotes" value="${esc(a.notes || '')}">

    <button class="btn-primary mt16" id="eaSaveBtn" onclick="_saveEditAdmission(${id})">${t('common.saveChanges')}</button>
    <button class="btn-secondary" onclick="_loadAdmissionDetail(${id})">${t('common.cancel')}</button>
  `;
};

window._saveEditAdmission = async function(id) {
  const nameEn = document.getElementById('eaNameEn').value.trim();
  if (!nameEn) { showToast(t('adm.nameRequired')); return; }
  const parentEmail = document.getElementById('eaParentEmail').value.trim();
  if (parentEmail && !isValidEmail(parentEmail)) { showToast(t('adm.validEmail')); return; }

  const btn = document.getElementById('eaSaveBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    await API.updateAdmission(id, {
      applicant_name_en:    nameEn,
      applicant_name_local: document.getElementById('eaNameLocal').value.trim() || null,
      date_of_birth:        document.getElementById('eaDob').value || null,
      desired_class:        document.getElementById('eaClass').value.trim() || null,
      parent_name:          document.getElementById('eaParentName').value.trim() || null,
      parent_phone:         document.getElementById('eaParentPhone').value.trim() || null,
      parent_email:         parentEmail || null,
      source:               document.getElementById('eaSource').value.trim() || null,
      notes:                document.getElementById('eaNotes').value.trim() || null,
    });

    if (_admPendingPhotoFile) {
      try {
        const url = await API.uploadAdmissionPhoto(id, _admPendingPhotoFile);
        await API.setAdmissionPhoto(id, url);
      } catch (photoErr) {
        showToast(t('adm.savedPhotoFail', { err: photoErr.message || t('common.error') }));
      }
      _admPendingPhotoFile = null;
    } else if (_admRemovePhotoRequested) {
      try { await API.setAdmissionPhoto(id, null); } catch (photoErr) { /* non-fatal */ }
      _admRemovePhotoRequested = false;
    }

    showToast(t('adm.saved'));
    await _loadAdmissionDetail(id);
    await renderAdmissions();
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.saveChanges');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Convert to student (Pending) ──────────────────────────────────────── */

window._showConvertAdmissionView = function(id, desiredClass) {
  const el = document.getElementById('admDetailBody');
  if (!el) return;
  el.innerHTML = `
    <h3 class="modal-title">${t('adm.enrollBtn')}</h3>
    <p class="billing-notes">${t('adm.convertNote')}</p>
    <label class="field-label">${t('comms.class')}</label>
    <button type="button" class="form-picker-trigger" id="convClassBtn" onclick="pickClassValue('convClass')">
      <span class="form-picker-value" id="convClass_label">${desiredClass ? esc(desiredClass) : t('students.form.selectClass')}</span>
      <svg class="form-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <input type="hidden" id="convClass" value="${esc(desiredClass || '')}">
    <button class="btn-primary mt16" id="convSaveBtn" onclick="_saveConvertAdmission(${id})">${t('adm.enroll')}</button>
    <button class="btn-secondary" onclick="_loadAdmissionDetail(${id})">${t('common.cancel')}</button>
  `;
};

window._saveConvertAdmission = async function(id) {
  const cls = document.getElementById('convClass').value.trim();
  if (!cls) { showToast(t('adm.enterClass')); return; }

  const btn = document.getElementById('convSaveBtn');
  btn.disabled = true; btn.textContent = t('adm.enrollingBtn');
  try {
    const res = await API.convertAdmissionToStudent(id, { class: cls, status: 'Pending' });
    showToast(t('adm.recordCreated', { id: res.student.student_id }));
    await _loadAdmissionDetail(id);
    await renderAdmissions();
  } catch (e) {
    btn.disabled = false; btn.textContent = t('adm.enroll');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Registration invoice + activation ─────────────────────────────────── */

let _admInvoiceItems     = [];
let _admFeeItemsCatalog  = [];

// Same catalog-picker + multi-line-item editor Billing's own "New Invoice"
// uses (not a flat single-amount box) — so registering a student can bill
// Registration + Uniform + Books etc. all at once, from the same Fee Items
// catalog configured in Billing, rather than typing one number.
window._showRegistrationInvoiceView = async function(id, studentId) {
  const el = document.getElementById('admDetailBody');
  if (!el) return;
  el.innerHTML = skeletonCards(1);

  try { _admFeeItemsCatalog = await API.getFeeItems(); } catch (e) { _admFeeItemsCatalog = []; }
  _admInvoiceItems = [{ fee_item_id: null, description: 'Registration fee', amount: 0 }];

  el.innerHTML = `
    <h3 class="modal-title">${t('adm.regTitle')}</h3>
    <label class="field-label">${t('bill.lineItems')}</label>
    <div id="riItemsList"></div>
    <button type="button" class="btn-pill-action ghost" onclick="_addAdmInvoiceLineItem()">${t('bill.addLineItem')}</button>
    <div class="billing-total-row" id="riTotalRow">${t('bill.total', { n: 0 })}</div>
    <label class="field-label">${t('bill.dueDate')}</label>
    <input class="form-input" id="riDueDate" type="date">
    <button class="btn-primary mt16" id="riSaveBtn" onclick="_saveRegistrationInvoice(${id}, '${esc(studentId)}')">${t('bill.createInvoice')}</button>
    <button class="btn-secondary" onclick="_loadAdmissionDetail(${id})">${t('common.cancel')}</button>
  `;
  _renderAdmInvoiceItemsList();
};

function _renderAdmInvoiceItemsList() {
  const el = document.getElementById('riItemsList');
  if (!el) return;

  const catalogRow = _admFeeItemsCatalog.length
    ? `<div class="attend-class-select-wrap mb8">
         <select class="attend-class-select" onchange="_pickAdmCatalogItem(this)">
           <option value="">${t('bill.fromCatalog')}</option>
           ${_admFeeItemsCatalog.map(f => `<option value="${f.id}">${esc(f.name)} (${esc(String(f.default_amount))})</option>`).join('')}
         </select>
       </div>`
    : '';

  el.innerHTML = catalogRow + _admInvoiceItems.map((it, idx) => `
    <div class="billing-line-item" data-idx="${idx}">
      <input class="form-input" placeholder="${esc(t('bill.descPh'))}" value="${esc(it.description)}"
        oninput="_updateAdmInvoiceLineItem(${idx},'description',this.value)">
      <input class="form-input billing-amount-input" type="number" min="0" value="${esc(String(it.amount))}"
        oninput="_updateAdmInvoiceLineItem(${idx},'amount',this.value)">
      <button type="button" class="icon-btn-mini danger" onclick="_removeAdmInvoiceLineItem(${idx})" title="${esc(t('picker.remove'))}">🗑</button>
    </div>
  `).join('');

  _renderAdmInvoiceTotal();
}

window._addAdmInvoiceLineItem = function(feeItem = null) {
  _admInvoiceItems.push({
    fee_item_id: feeItem?.id || null,
    description: feeItem?.name || '',
    amount:      feeItem?.default_amount ?? 0,
  });
  _renderAdmInvoiceItemsList();
};

window._removeAdmInvoiceLineItem = function(idx) {
  _admInvoiceItems.splice(idx, 1);
  _renderAdmInvoiceItemsList();
};

window._updateAdmInvoiceLineItem = function(idx, field, val) {
  if (!_admInvoiceItems[idx]) return;
  _admInvoiceItems[idx][field] = field === 'amount' ? (Number(val) || 0) : val;
  _renderAdmInvoiceTotal();
};

function _renderAdmInvoiceTotal() {
  const row = document.getElementById('riTotalRow');
  if (!row) return;
  const total = _admInvoiceItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  row.textContent = t('bill.total', { n: total });
}

window._pickAdmCatalogItem = function(sel) {
  const id = Number(sel.value);
  sel.value = '';
  if (!id) return;
  const item = _admFeeItemsCatalog.find(f => f.id === id);
  if (item) window._addAdmInvoiceLineItem(item);
};

window._saveRegistrationInvoice = async function(id, studentId) {
  const items = _admInvoiceItems.filter(it => it.description && it.description.trim() && Number(it.amount) > 0);
  if (!items.length) { showToast(t('adm.needAmountItem')); return; }

  const btn = document.getElementById('riSaveBtn');
  btn.disabled = true; btn.textContent = t('grades.creating');
  try {
    // Default to the current term, same as the Billing page's own new-invoice
    // flow — Billing's invoice list filters by term (defaulting to the
    // current one), so an invoice created with no term_id would silently
    // never show up there.
    let termId = null;
    try {
      const terms = await API.getTerms();
      const current = (terms || []).find(t => t.is_current) || (terms || [])[0];
      termId = current?.id || null;
    } catch (e) { /* no terms configured — leave unset */ }

    const invRes = await API.createInvoice({
      student_id: studentId,
      term_id:    termId,
      due_date:   document.getElementById('riDueDate').value || null,
      notes:      'Registration',
      items,
    });
    await API.linkAdmissionInvoice(id, invRes.invoice.id);
    showToast(t('adm.regCreated'));
    await _loadAdmissionDetail(id);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('bill.createInvoice');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Delete ─────────────────────────────────────────────────────────────── */

window._confirmDeleteAdmission = function(id) {
  showConfirm(
    t('adm.delTitle'),
    t('adm.delBody'),
    t('btn.delete'),
    async () => {
      try {
        await API.deleteAdmission(id);
        closeModal();
        showToast(t('common.deleted'));
        await renderAdmissions();
      } catch (e) {
        showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
      }
    }
  );
};
