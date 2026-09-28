/**
 * SCMS v11 — 25_transport.js
 * Bus routes + per-student pickup/dropoff assignment.
 *
 * Same conventions as Library/Admissions/Billing: single modal body
 * (#routeDetailBody) swapped in place, module-level cache instead of
 * JSON-in-onclick, stale-while-revalidate list loading.
 *
 * Web only for now — no n8n/Telegram equivalent yet.
 */

'use strict';

let _transportRoutesAll  = [];
let _transportLoadedOnce = false;
let _transportRouteCache = null; // the currently-open route, for edit/assign views

async function renderTransport() {
  const listEl = document.getElementById('transportList');
  if (_transportLoadedOnce) {
    _renderTransportList();
  } else if (listEl) {
    listEl.innerHTML = skeletonCards(2);
  }

  try {
    _transportRoutesAll = await API.getRoutes();
    _transportLoadedOnce = true;
  } catch (e) {
    if (!_transportLoadedOnce && listEl) listEl.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }

  _renderTransportList();
}

function _renderTransportList() {
  const el = document.getElementById('transportList');
  if (!el) return;

  if (!_transportRoutesAll.length) {
    el.innerHTML = `<div class="empty-state">${t('tr.none')}</div>`;
    return;
  }

  el.innerHTML = _transportRoutesAll.map(r => `
    <div class="list-card" onclick="openRouteDetail(${r.id})">
      <div class="card-row">
        <div class="card-info">
          <div class="card-name">${esc(r.route_name)}</div>
          <div class="card-sub">${esc(r.driver_name || t('tr.noDriver'))} ${r.driver_phone ? '· ' + esc(r.driver_phone) : ''}</div>
        </div>
        <div class="card-actions">
          <span class="adm-status-badge adm-status-accepted">${esc(String(r.student_count))} 🧑‍🎓</span>
        </div>
      </div>
    </div>
  `).join('');
}

/* ─── New route ──────────────────────────────────────────────────────── */

window.openNewRouteModal = function() {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('tr.newTitle')}</h3>
      <label class="field-label">${t('tr.routeName')}</label>
      <input class="form-input" id="nrName" placeholder="${esc(t('tr.routeNamePh'))}">
      <label class="field-label">${t('tr.driverName')}</label>
      <input class="form-input" id="nrDriverName" placeholder="${esc(t('health.medicationsOpt'))}">
      <label class="field-label">${t('tr.driverPhone')}</label>
      <input class="form-input" id="nrDriverPhone" placeholder="${esc(t('health.medicationsOpt'))}" type="tel">
      <label class="field-label">${t('tr.vehicle')}</label>
      <input class="form-input" id="nrVehicle" placeholder="${esc(t('tr.vehiclePh'))}">
      <label class="field-label">${t('health.notes')}</label>
      <input class="form-input" id="nrNotes" placeholder="${esc(t('health.medicationsOpt'))}">
      <button class="btn-primary mt16" id="nrSaveBtn" onclick="_saveNewRoute()">${t('tr.add')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._saveNewRoute = async function() {
  const name = document.getElementById('nrName').value.trim();
  if (!name) { showToast(t('tr.enterName')); return; }

  const btn = document.getElementById('nrSaveBtn');
  btn.disabled = true; btn.textContent = t('subject.adding');
  try {
    await API.addRoute({
      route_name: name,
      driver_name: document.getElementById('nrDriverName').value.trim() || null,
      driver_phone: document.getElementById('nrDriverPhone').value.trim() || null,
      vehicle_info: document.getElementById('nrVehicle').value.trim() || null,
      notes: document.getElementById('nrNotes').value.trim() || null,
    });
    closeModal();
    showToast(t('tr.added'));
    await renderTransport();
  } catch (e) {
    btn.disabled = false; btn.textContent = t('tr.add');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Detail (single modal — sub-views swap #routeDetailBody in place) ─── */

window.openRouteDetail = function(id) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div id="routeDetailBody">${skeletonCards(1)}</div>
    </div>
  `);
  _loadRouteDetail(id);
};

async function _loadRouteDetail(id) {
  const el = document.getElementById('routeDetailBody');
  if (!el) return;
  try {
    const res = await API.getRouteDetail(id);
    _transportRouteCache = res.route;
    _renderRouteDetailView(id, res.students);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
  }
}

function _renderRouteDetailView(id, students) {
  const el = document.getElementById('routeDetailBody');
  if (!el) return;
  const r = _transportRouteCache;
  if (!r) { el.innerHTML = `<div class="empty-state">${t('common.itemNotFound')}</div>`; return; }

  el.innerHTML = `
    <h3 class="modal-title">${esc(r.route_name)}</h3>
    <div class="billing-detail-items">
      <div class="billing-detail-row"><span>${t('tr.driver')}</span><span>${esc(r.driver_name || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('tr.phone')}</span><span>${esc(r.driver_phone || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('tr.vehicleLabel')}</span><span>${esc(r.vehicle_info || '—')}</span></div>
    </div>
    ${r.notes ? `<p class="billing-notes">${esc(r.notes)}</p>` : ''}

    <div class="billing-section-title mt16">${t('tr.students', { n: students.length })}</div>
    ${students.length ? students.map(s => `
      <div class="row-with-delete">
        <span>${esc(s.name_en)} <span class="muted-note">${esc(s.class || '')}${s.pickup_stop ? ' · ' + esc(s.pickup_stop) : ''}${s.pickup_time ? ' · ' + esc(s.pickup_time.slice(0,5)) : ''}</span></span>
        <button class="icon-btn-mini danger" onclick="_removeFromRoute('${esc(s.student_id)}', ${id})" title="${esc(t('picker.remove'))}">🗑</button>
      </div>
    `).join('') : `<p class="muted-note">${t('tr.noStudents')}</p>`}

    <button class="btn-primary mt16" onclick="_showAssignStudentView(${id})">${t('tr.assign')}</button>
    <button class="btn-secondary" onclick="_showEditRouteView(${id})">${t('tr.editRoute')}</button>
    <button class="btn-secondary" onclick="_confirmDeleteRoute(${id})">${t('tr.deleteRoute')}</button>
  `;
}

window._showEditRouteView = function(id) {
  const el = document.getElementById('routeDetailBody');
  if (!el) return;
  const r = _transportRouteCache;
  if (!r) return;

  el.innerHTML = `
    <h3 class="modal-title">${t('tr.editTitle')}</h3>
    <label class="field-label">${t('tr.routeName')}</label>
    <input class="form-input" id="erName" value="${esc(r.route_name)}">
    <label class="field-label">${t('tr.driverName')}</label>
    <input class="form-input" id="erDriverName" value="${esc(r.driver_name || '')}">
    <label class="field-label">${t('tr.driverPhone')}</label>
    <input class="form-input" id="erDriverPhone" value="${esc(r.driver_phone || '')}">
    <label class="field-label">${t('tr.vehicle')}</label>
    <input class="form-input" id="erVehicle" value="${esc(r.vehicle_info || '')}">
    <label class="field-label">${t('health.notes')}</label>
    <input class="form-input" id="erNotes" value="${esc(r.notes || '')}">
    <button class="btn-primary mt16" id="erSaveBtn" onclick="_saveEditRoute(${id})">${t('common.saveChanges')}</button>
    <button class="btn-secondary" onclick="_loadRouteDetail(${id})">${t('common.cancel')}</button>
  `;
};

window._saveEditRoute = async function(id) {
  const name = document.getElementById('erName').value.trim();
  if (!name) { showToast(t('tr.routeRequired')); return; }

  const btn = document.getElementById('erSaveBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    await API.updateRoute(id, {
      route_name: name,
      driver_name: document.getElementById('erDriverName').value.trim() || null,
      driver_phone: document.getElementById('erDriverPhone').value.trim() || null,
      vehicle_info: document.getElementById('erVehicle').value.trim() || null,
      notes: document.getElementById('erNotes').value.trim() || null,
    });
    showToast(t('common.saved'));
    await renderTransport();
    await _loadRouteDetail(id);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.saveChanges');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._showAssignStudentView = function(id) {
  const el = document.getElementById('routeDetailBody');
  if (!el) return;
  el.innerHTML = `
    <h3 class="modal-title">${t('tr.assignTitle')}</h3>
    <label class="field-label">${t('tr.students', {n:''}).split(' (')[0]}</label>
    <button type="button" class="form-picker-trigger" id="asStudentBtn" onclick="openStudentPicker({onPick:_onAssignStudentPicked})">
      <span class="form-picker-value" id="asStudent_label">${t('lib.selectStudent')}</span>
      <svg class="form-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <input type="hidden" id="asStudentId" value="">
    <label class="field-label">${t('tr.pickupStop')}</label>
    <input class="form-input" id="asPickupStop" placeholder="${esc(t('tr.pickupStopPh'))}">
    <label class="field-label">${t('tr.pickupTime')}</label>
    <input class="form-input" id="asPickupTime" type="time">
    <label class="field-label">${t('tr.dropoffTime')}</label>
    <input class="form-input" id="asDropoffTime" type="time">
    <button class="btn-primary mt16" id="asSaveBtn" onclick="_saveAssignStudent(${id})">${t('tr.assignBtn')}</button>
    <button class="btn-secondary" onclick="_loadRouteDetail(${id})">${t('common.cancel')}</button>
  `;
};

window._onAssignStudentPicked = function(student) {
  document.getElementById('asStudentId').value = student.student_id;
  document.getElementById('asStudent_label').textContent = student.name_en;
};

window._saveAssignStudent = async function(routeId) {
  const studentId = document.getElementById('asStudentId').value;
  if (!studentId) { showToast(t('lib.pickStudent')); return; }

  const btn = document.getElementById('asSaveBtn');
  btn.disabled = true; btn.textContent = t('tr.assigning');
  try {
    await API.assignStudentTransport(studentId, {
      route_id: routeId,
      pickup_stop: document.getElementById('asPickupStop').value.trim() || null,
      pickup_time: document.getElementById('asPickupTime').value || null,
      dropoff_time: document.getElementById('asDropoffTime').value || null,
    });
    showToast(t('tr.assigned'));
    await renderTransport();
    await _loadRouteDetail(routeId);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('tr.assignBtn');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._removeFromRoute = async function(studentId, routeId) {
  try {
    await API.removeStudentTransport(studentId);
    showToast(t('bill.removedToast'));
    await renderTransport();
    await _loadRouteDetail(routeId);
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._confirmDeleteRoute = function(id) {
  showConfirm(
    t('tr.delTitle'),
    t('tr.delBody'),
    t('btn.delete'),
    async () => {
      try {
        await API.deleteRoute(id);
        closeModal();
        showToast(t('common.deleted'));
        await renderTransport();
      } catch (e) {
        showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
      }
    }
  );
};
