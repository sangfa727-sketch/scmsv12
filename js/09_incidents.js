/**
 * SCMS v11 — 09_incidents.js
 * Incident recording: list, filter, add modal with smart student picker.
 */

'use strict';

let _incidentType = 'All';
let _incPickedStudent = null;

function renderIncidents() {
  _renderIncidentTypeChips();
  _renderIncidentList();
}

function _renderIncidentTypeChips() {
  const el = document.getElementById('incidentTypeChips');
  if (!el) return;

  const types = ['All', ...(window.APP.config?.incident_types ||
    ['Good Behaviour','Participation','Achievement','Concern','Health','Other'])];

  el.innerHTML = types.map(ty =>
    `<button class="chip${ty === _incidentType ? ' active' : ''}" data-type="${esc(ty)}"
      onclick="filterIncidentType('${esc(ty)}')">${esc(tv('incType', ty))}</button>`
  ).join('');
}

window.filterIncidentType = function(type) {
  _incidentType = type;
  document.querySelectorAll('#incidentTypeChips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type)
  );
  _renderIncidentList();
};

function _renderIncidentList() {
  const el = document.getElementById('incidentList');
  if (!el) return;

  let list = [...window.APP.incidents].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (_incidentType !== 'All') list = list.filter(i => i.type === _incidentType);

  if (!list.length) {
    el.innerHTML = emptyState('⚡', t('inc.none'), t('inc.tapLog'));
    return;
  }

  const sevColor = { Info:'#6B7280', Low:'#0891B2', Medium:'#D97706', High:'#DC2626', Critical:'#7C3AED' };
  const typeIcon  = { 'Good Behaviour':'⭐','Participation':'🙋','Achievement':'🏆','Concern':'⚠️','Health':'🏥','Other':'📋','Bullying':'🚫','Injury':'🩹' };

  el.innerHTML = list.map(i => {
    const color = sevColor[i.severity] || '#6B7280';
    const icon  = typeIcon[i.type]     || '📋';

    return `
      <div class="list-card" data-incident-id="${esc(i.id)}">
        <div class="card-row">
          <div class="incident-icon">${icon}</div>
          <div class="card-info">
            <div class="card-name">${esc(i.name_en || i.student_id || '—')}</div>
            <div class="card-sub">
              ${esc(tv('incType', i.type))} ·
              <span class="sev-badge" style="color:${color}">${esc(tv('severity', i.severity))}</span>
              · ${esc(i.date || '—')}
            </div>
          </div>
          ${i.parent_notified ? `<span class="notif-badge" title="${esc(t('inc.parentNotified'))}">✓</span>` : ''}
          <div class="card-actions">
            <button class="icon-btn-mini" onclick="openEditIncident('${esc(i.id)}')" title="${esc(t('common.edit'))}">✎</button>
            <button class="icon-btn-mini danger" onclick="confirmDeleteIncident('${esc(i.id)}')" title="${esc(t('btn.delete'))}">🗑</button>
          </div>
        </div>
        ${i.description   ? `<div class="card-note">${esc(i.description)}</div>` : ''}
        ${i.action_taken  ? `<div class="card-action">${t('inc.action')} ${esc(i.action_taken)}</div>` : ''}
      </div>`;
  }).join('');
}

window.openIncidentModal = function(prefillStudent) {
  // If a student object was passed in directly, use it; otherwise open the picker first
  if (prefillStudent && typeof prefillStudent === 'object' && prefillStudent.student_id) {
    _incPickedStudent = prefillStudent;
    _renderIncidentForm();
    return;
  }
  _incPickedStudent = null;
  openStudentPicker({
    title:   t('inc.pickerTitle'),
    onPick:  (s) => { _incPickedStudent = s; _renderIncidentForm(); },
  });
};

function _renderIncidentForm() {
  const s = _incPickedStudent || {};
  const types      = window.APP.config?.incident_types ||
    ['Good Behaviour','Participation','Achievement','Concern','Conflict','Health','Other'];
  const severities = window.APP.config?.severities || ['Info','Low','Medium','High'];

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('inc.logTitle')}</h3>

      <label class="field-label">${t('inc.student')}</label>
      <button type="button" class="picker-trigger" onclick="openIncidentModal()">
        <span>${esc(s.name_en || s.name_local || t('inc.tapChoose'))}</span>
        ${s.class ? `<span class="picker-trigger-meta">${esc(s.class)}</span>` : ''}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      <label class="field-label">${t('inc.type')}</label>
      <div class="pill-group" id="incTypePills">
        ${types.map((ty, i) => `<button type="button" class="pill ${i===0?'active':''}" data-value="${esc(ty)}" onclick="togglePill(this,'incTypePills')">${esc(tv('incType', ty))}</button>`).join('')}
      </div>

      <label class="field-label">${t('inc.severity')}</label>
      <div class="pill-group" id="incSevPills">
        ${severities.map((sev, i) => `<button type="button" class="pill ${i===0?'active':''}" data-value="${esc(sev)}" onclick="togglePill(this,'incSevPills')">${esc(tv('severity', sev))}</button>`).join('')}
      </div>

      <label class="field-label">${t('inc.description')}</label>
      <textarea class="form-textarea" id="incDesc" rows="3" placeholder="${esc(t('inc.whatHappened'))}"></textarea>

      <label class="field-label">${t('inc.actionTaken')} <span class="optional">${t('common.optional')}</span></label>
      <input class="form-input" id="incAction" placeholder="${esc(t('inc.actionPh'))}">

      <label class="field-label toggle-row">
        <span>${t('inc.notifyParent')}</span>
        <input type="checkbox" id="incNotify" class="toggle-check">
      </label>

      <button class="btn-primary mt16" id="saveIncBtn" onclick="saveIncident()">${t('btn.save')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>`;

  openModal(html);
}

window.saveIncident = async function() {
  const btn = document.getElementById('saveIncBtn');
  const stu = _incPickedStudent;

  if (!stu) { showToast(t('inc.pickFirst')); return; }

  btn.disabled = true; btn.textContent = t('common.saving');

  try {
    const data = {
      student_id:     stu.student_id,
      name_en:        stu.name_en,
      class:          stu.class || '',
      type:           document.querySelector('#incTypePills .pill.active')?.dataset.value || 'Other',
      severity:       document.querySelector('#incSevPills .pill.active')?.dataset.value || 'Info',
      description:    document.getElementById('incDesc').value.trim(),
      action_taken:   document.getElementById('incAction').value.trim(),
      parent_notified: document.getElementById('incNotify').checked,
      date:           new Date().toISOString().slice(0, 10),
      teacher_id:     window.APP.teacher_id,
      school_id:      window.APP.school_id,
    };

        const res = await API.saveIncident(data);
    window.APP.incidents.unshift(res?.incident || data);

    closeModal();
    _renderIncidentList();
    showToast(t('inc.logged'));
    if (window.APP.tg?.HapticFeedback) window.APP.tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    btn.disabled = false; btn.textContent = t('btn.save');
    showToast(t('att.saveFailed', { err: e.message || t('common.error') }));
  }
};

/* ─── Edit + Delete ─────────────────────────────────────────────── */

window.openEditIncident = function(id) {
  const inc = window.APP.incidents.find(x => String(x.id) === String(id));
  if (!inc) { showToast(t('common.itemNotFound')); return; }
  const types = ['Good Behaviour','Participation','Achievement','Concern','Health','Bullying','Injury','Other'];
  const sevs  = ['Info','Low','Medium','High','Critical'];

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('inc.editTitle')}</h3>
      <p class="modal-subtitle">${esc(inc.name_en || inc.student_id || '')} · ${esc(inc.date || '')}</p>

      <label class="field-label">${t('inc.type')}</label>
      <select class="form-input" id="eincType">
        ${types.map(ty => `<option value="${esc(ty)}" ${ty===inc.type?'selected':''}>${esc(tv('incType', ty))}</option>`).join('')}
      </select>

      <label class="field-label">${t('inc.severity')}</label>
      <select class="form-input" id="eincSev">
        ${sevs.map(sv => `<option value="${esc(sv)}" ${sv===inc.severity?'selected':''}>${esc(tv('severity', sv))}</option>`).join('')}
      </select>

      <label class="field-label">${t('inc.description')}</label>
      <textarea class="form-textarea" id="eincDesc" rows="3">${esc(inc.description || '')}</textarea>

      <label class="field-label">${t('inc.actionTaken')}</label>
      <textarea class="form-textarea" id="eincAction" rows="2">${esc(inc.action_taken || '')}</textarea>

      <label class="field-label">
        <input type="checkbox" id="eincNotified" ${inc.parent_notified ? 'checked' : ''}>
        ${t('inc.parentNotified')}
      </label>

      <button class="btn-primary mt16" id="saveEincBtn" onclick="saveEditIncident('${esc(id)}')">${t('common.saveChanges')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window.saveEditIncident = async function(id) {
  const btn = document.getElementById('saveEincBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    const patch = {
      type:            document.getElementById('eincType').value,
      severity:        document.getElementById('eincSev').value,
      description:     document.getElementById('eincDesc').value.trim(),
      action_taken:    document.getElementById('eincAction').value.trim(),
      parent_notified: document.getElementById('eincNotified').checked,
    };
    await API.updateIncident(id, patch);
    const idx = window.APP.incidents.findIndex(x => String(x.id) === String(id));
    if (idx >= 0) window.APP.incidents[idx] = { ...window.APP.incidents[idx], ...patch };
    closeModal();
    _renderIncidentList();
    showToast(t('inc.updated'));
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.saveChanges');
    showToast(t('common.updateFailed', { err: e.message || t('common.error') }));
  }
};

window.confirmDeleteIncident = function(id) {
  showConfirm(
    t('inc.confirmTitle'),
    t('common.cantUndo'),
    t('btn.delete'),
    () => doDeleteIncident(id)
  );
};

async function doDeleteIncident(id) {
  try {
    await API.deleteIncident(id);
    window.APP.incidents = window.APP.incidents.filter(x => String(x.id) !== String(id));
    _renderIncidentList();
    showToast(t('common.deleted'));
  } catch (e) {
    showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
  }
}
