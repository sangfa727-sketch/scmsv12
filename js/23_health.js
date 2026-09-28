/**
 * SCMS v11 — 23_health.js
 * Health Records: a per-student profile (allergies, conditions, medications,
 * emergency contact) + vaccination history + a clinic/nurse visit log.
 *
 * Not a standalone list page — health data is inherently per-student, so
 * it's reached from the Student detail view ("🏥 Health Record" button),
 * same idea as the Student ID Card.
 *
 * Single modal, all sub-views (profile/edit-profile/add-vaccination/
 * add-visit) swap one body element's innerHTML in place — never a second
 * stacked openModal() call — matching the fix applied to every other
 * module this session.
 */

'use strict';

window.showHealthRecord = function(studentId) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-height:85vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <h3 class="modal-title">🏥 ${t('students.btn.health')}</h3>
      <div id="healthRecordBody">${skeletonCards(2)}</div>
    </div>
  `);
  _loadHealthRecord(studentId);
};

let _healthProfileCache = {};

async function _loadHealthRecord(studentId) {
  const el = document.getElementById('healthRecordBody');
  if (!el) return;
  try {
    const res = await API.getHealthProfile(studentId);
    _healthProfileCache = res.profile || {};
    _renderHealthRecordView(studentId, res.profile, res.vaccinations, res.visits);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
  }
}

function _renderHealthRecordView(studentId, profile, vaccinations, visits) {
  const el = document.getElementById('healthRecordBody');
  if (!el) return;
  profile = profile || {};

  const hasAlert = !!(profile.allergies || profile.medical_conditions);

  el.innerHTML = `
    ${hasAlert ? `
      <div class="health-alert">
        ${profile.allergies ? `<div>⚠️ <strong>${t('health.allergiesLabel')}</strong> ${esc(profile.allergies)}</div>` : ''}
        ${profile.medical_conditions ? `<div>⚠️ <strong>${t('health.conditionsLabel')}</strong> ${esc(profile.medical_conditions)}</div>` : ''}
      </div>
    ` : ''}

    <div class="billing-detail-items">
      <div class="billing-detail-row"><span>${t('health.bloodType')}</span><span>${esc(profile.blood_type || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('health.medications')}</span><span>${esc(profile.medications || '—')}</span></div>
      <div class="billing-detail-row"><span>${t('health.emergencyContact')}</span><span>${esc(profile.emergency_contact_name || '—')}${profile.emergency_contact_phone ? ' · ' + esc(profile.emergency_contact_phone) : ''}</span></div>
      <div class="billing-detail-row"><span>${t('health.doctor')}</span><span>${esc(profile.doctor_name || '—')}${profile.doctor_phone ? ' · ' + esc(profile.doctor_phone) : ''}</span></div>
    </div>
    ${profile.notes ? `<p class="billing-notes">${esc(profile.notes)}</p>` : ''}
    <button class="btn-secondary" onclick="_showEditHealthProfile('${esc(studentId)}')">${t('health.editProfile')}</button>

    <div class="billing-section-title mt16">${t('health.vaccinations')}</div>
    ${vaccinations.length ? vaccinations.map(v => `
      <div class="row-with-delete">
        <div>
          <div class="card-name" style="font-size:14px">${esc(v.vaccine_name)}</div>
          <div class="card-sub">${v.date_given ? esc(fmtDate(v.date_given)) : t('health.noDate')}${v.notes ? ' · ' + esc(v.notes) : ''}</div>
        </div>
        <button type="button" class="icon-btn-mini danger" onclick="_deleteVaccinationRow(${v.id}, '${esc(studentId)}')" title="${esc(t('btn.delete'))}">🗑</button>
      </div>
    `).join('') : `<p class="muted-note">${t('health.noVax')}</p>`}
    <button class="btn-pill-action ghost" onclick="_showAddVaccination('${esc(studentId)}')">${t('health.addVax')}</button>

    <div class="billing-section-title mt16">${t('health.visits')}</div>
    ${visits.length ? visits.map(v => `
      <div class="row-with-delete">
        <div>
          <div class="card-name" style="font-size:14px">${esc(fmtDate(v.date))} — ${esc(v.reason)}</div>
          <div class="card-sub">${v.treatment ? esc(v.treatment) : ''}${v.notes ? ' · ' + esc(v.notes) : ''}</div>
        </div>
        <button type="button" class="icon-btn-mini danger" onclick="_deleteHealthVisitRow(${v.id}, '${esc(studentId)}')" title="${esc(t('btn.delete'))}">🗑</button>
      </div>
    `).join('') : `<p class="muted-note">${t('health.noVisits')}</p>`}
    <button class="btn-pill-action ghost" onclick="_showAddHealthVisit('${esc(studentId)}')">${t('health.logVisit')}</button>

    <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
  `;
}

/* ─── Edit profile ───────────────────────────────────────────────────────── */

window._showEditHealthProfile = function(studentId) {
  const p = _healthProfileCache || {};
  const el = document.getElementById('healthRecordBody');
  if (!el) return;

  el.innerHTML = `
    <h3 class="modal-title" style="font-size:16px">${t('health.editTitle')}</h3>
    <label class="field-label">${t('health.bloodType')}</label>
    <input class="form-input" id="hpBloodType" value="${esc(p.blood_type || '')}" placeholder="${esc(t('health.bloodTypePh'))}">
    <label class="field-label">${t('health.allergies')}</label>
    <input class="form-input" id="hpAllergies" value="${esc(p.allergies || '')}" placeholder="${esc(t('health.allergiesPh'))}">
    <label class="field-label">${t('health.conditions')}</label>
    <input class="form-input" id="hpConditions" value="${esc(p.medical_conditions || '')}" placeholder="${esc(t('health.conditionsPh'))}">
    <label class="field-label">${t('health.medications')}</label>
    <input class="form-input" id="hpMedications" value="${esc(p.medications || '')}" placeholder="${esc(t('health.medicationsOpt'))}">
    <label class="field-label">${t('health.emContactName')}</label>
    <input class="form-input" id="hpEmName" value="${esc(p.emergency_contact_name || '')}">
    <label class="field-label">${t('health.emContactPhone')}</label>
    <input class="form-input" id="hpEmPhone" value="${esc(p.emergency_contact_phone || '')}" type="tel">
    <label class="field-label">${t('health.doctorName')}</label>
    <input class="form-input" id="hpDoctorName" value="${esc(p.doctor_name || '')}">
    <label class="field-label">${t('health.doctorPhone')}</label>
    <input class="form-input" id="hpDoctorPhone" value="${esc(p.doctor_phone || '')}" type="tel">
    <label class="field-label">${t('health.notes')}</label>
    <input class="form-input" id="hpNotes" value="${esc(p.notes || '')}">

    <button class="btn-primary mt16" id="hpSaveBtn" onclick="_saveHealthProfile('${esc(studentId)}')">${t('btn.save')}</button>
    <button class="btn-secondary" onclick="_loadHealthRecord('${esc(studentId)}')">${t('common.cancel')}</button>
  `;
};

window._saveHealthProfile = async function(studentId) {
  const btn = document.getElementById('hpSaveBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    await API.upsertHealthProfile(studentId, {
      blood_type: document.getElementById('hpBloodType').value.trim(),
      allergies: document.getElementById('hpAllergies').value.trim(),
      medical_conditions: document.getElementById('hpConditions').value.trim(),
      medications: document.getElementById('hpMedications').value.trim(),
      emergency_contact_name: document.getElementById('hpEmName').value.trim(),
      emergency_contact_phone: document.getElementById('hpEmPhone').value.trim(),
      doctor_name: document.getElementById('hpDoctorName').value.trim(),
      doctor_phone: document.getElementById('hpDoctorPhone').value.trim(),
      notes: document.getElementById('hpNotes').value.trim(),
    });
    showToast(t('common.saved'));
    await _loadHealthRecord(studentId);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('btn.save');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

/* ─── Vaccinations ───────────────────────────────────────────────────────── */

window._showAddVaccination = function(studentId) {
  const el = document.getElementById('healthRecordBody');
  if (!el) return;
  el.innerHTML = `
    <h3 class="modal-title" style="font-size:16px">${t('health.addVaxTitle')}</h3>
    <label class="field-label">${t('health.vaccineName')}</label>
    <input class="form-input" id="vxName" placeholder="${esc(t('health.vaccineNamePh'))}">
    <label class="field-label">${t('health.dateGiven')}</label>
    <input class="form-input" id="vxDate" type="date">
    <label class="field-label">${t('health.notes')}</label>
    <input class="form-input" id="vxNotes" placeholder="${esc(t('health.medicationsOpt'))}">
    <button class="btn-primary mt16" id="vxSaveBtn" onclick="_saveVaccination('${esc(studentId)}')">${t('common.add')}</button>
    <button class="btn-secondary" onclick="_loadHealthRecord('${esc(studentId)}')">${t('common.cancel')}</button>
  `;
};

window._saveVaccination = async function(studentId) {
  const name = document.getElementById('vxName').value.trim();
  if (!name) { showToast(t('health.enterVaccine')); return; }

  const btn = document.getElementById('vxSaveBtn');
  btn.disabled = true; btn.textContent = t('subject.adding');
  try {
    await API.addVaccination(studentId, {
      vaccine_name: name,
      date_given: document.getElementById('vxDate').value || null,
      notes: document.getElementById('vxNotes').value.trim(),
    });
    showToast(t('health.added'));
    await _loadHealthRecord(studentId);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('common.add');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._deleteVaccinationRow = function(id, studentId) {
  showConfirm(t('health.delVaxTitle'), '', t('btn.delete'), async () => {
    try {
      await API.deleteVaccination(id);
      showToast(t('common.deleted'));
      await _loadHealthRecord(studentId);
    } catch (e) {
      showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
    }
  });
};

/* ─── Clinic / nurse visits ──────────────────────────────────────────────── */

window._showAddHealthVisit = function(studentId) {
  const el = document.getElementById('healthRecordBody');
  if (!el) return;
  el.innerHTML = `
    <h3 class="modal-title" style="font-size:16px">${t('health.logVisitTitle')}</h3>
    <label class="field-label">${t('grades.date')}</label>
    <input class="form-input" id="hvDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
    <label class="field-label">${t('health.reason')}</label>
    <input class="form-input" id="hvReason" placeholder="${esc(t('health.reasonPh'))}">
    <label class="field-label">${t('health.treatment')}</label>
    <input class="form-input" id="hvTreatment" placeholder="${esc(t('health.medicationsOpt'))}">
    <label class="field-label">${t('health.notes')}</label>
    <input class="form-input" id="hvNotes" placeholder="${esc(t('health.medicationsOpt'))}">
    <button class="btn-primary mt16" id="hvSaveBtn" onclick="_saveHealthVisit('${esc(studentId)}')">${t('health.logVisit').replace('+ ', '')}</button>
    <button class="btn-secondary" onclick="_loadHealthRecord('${esc(studentId)}')">${t('common.cancel')}</button>
  `;
};

window._saveHealthVisit = async function(studentId) {
  const reason = document.getElementById('hvReason').value.trim();
  if (!reason) { showToast(t('health.enterReason')); return; }

  const btn = document.getElementById('hvSaveBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    await API.addHealthVisit(studentId, {
      date: document.getElementById('hvDate').value || null,
      reason,
      treatment: document.getElementById('hvTreatment').value.trim(),
      notes: document.getElementById('hvNotes').value.trim(),
    });
    showToast(t('health.logged'));
    await _loadHealthRecord(studentId);
  } catch (e) {
    btn.disabled = false; btn.textContent = t('health.logVisit').replace('+ ', '');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window._deleteHealthVisitRow = function(id, studentId) {
  showConfirm(t('health.delVisitTitle'), '', t('btn.delete'), async () => {
    try {
      await API.deleteHealthVisit(id);
      showToast(t('common.deleted'));
      await _loadHealthRecord(studentId);
    } catch (e) {
      showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
    }
  });
};
