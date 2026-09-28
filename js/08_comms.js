/**
 * SCMS v11 — 08_comms.js
 * Parent communications: list + broadcast modal with smart student picker.
 */

'use strict';

let _commsType = 'All';
let _commPickedStudent = null;   // selected student when sending individual msg

function renderComms() {
  const el = document.getElementById('commsTypeChips');
  if (!el) return;

  const types = ['All','General','Absent Alert','Daily Report','Praise','Incident','Homework','Broadcast'];
  el.innerHTML = types.map(ty =>
    `<button class="chip${ty === _commsType ? ' active' : ''}" data-type="${esc(ty)}"
      onclick="filterCommsType('${esc(ty)}')">${esc(tv('commType', ty))}</button>`
  ).join('');

  _renderCommsList();
}

window.filterCommsType = function(type) {
  _commsType = type;
  document.querySelectorAll('#commsTypeChips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type)
  );
  _renderCommsList();
};

function _renderCommsList() {
  const el = document.getElementById('commsList');
  if (!el) return;

  let list = [...window.APP.parentComms].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (_commsType !== 'All') list = list.filter(c => c.type === _commsType);

  if (!list.length) {
    el.innerHTML = emptyState('💬', t('comms.none'), t('comms.noneSub'));
    return;
  }

  const typeIcon = { 'Daily Report':'📋','Absent Alert':'🚨','Praise':'⭐','Incident':'⚡','Homework':'📚','Broadcast':'📢','General':'💬' };

  el.innerHTML = list.map(c => `
    <div class="list-card" data-comm-id="${esc(c.id)}">
      <div class="card-row">
        <div class="comm-icon">${typeIcon[c.type] || '💬'}</div>
        <div class="card-info">
          <div class="card-name">${esc(c.name_en || (c.class ? t('comms.classBroadcast', { class: c.class }) : t('comms.broadcast')))}</div>
          <div class="card-sub">${esc(tv('commType', c.type))} · ${esc(fmtDate(c.date))}</div>
          ${c.message_preview ? `<div class="card-note">${esc(c.message_preview.slice(0, 100))}${c.message_preview.length > 100 ? '…' : ''}</div>` : ''}
        </div>
        <span class="status-dot ${c.status === 'Sent' ? 'dot-sent' : 'dot-queued'}" title="${esc(tv('commStatus', c.status || 'queued'))}"></span>
        <div class="card-actions">
          <button class="icon-btn-mini danger" onclick="confirmDeleteComm('${esc(c.id)}')" title="${esc(t('btn.delete'))}">🗑</button>
        </div>
      </div>
    </div>`
  ).join('');
}

window.confirmDeleteComm = function(id) {
  showConfirm(
    t('comms.confirmTitle'),
    t('common.cantUndo'),
    t('btn.delete'),
    () => doDeleteComm(id)
  );
};

async function doDeleteComm(id) {
  try {
    await API.deleteParentComm(id);
    window.APP.parentComms = window.APP.parentComms.filter(x => String(x.id) !== String(id));
    _renderCommsList();
    showToast(t('common.deleted'));
  } catch (e) {
    showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
  }
}

window.openParentPortalEventModal = function() {
  const classes = window.getClassList();
  openModal(`
    <div class="modal-sheet comms-form-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">Parent Portal schedule</h3>
      <p class="modal-subtitle">Exam မဟုတ်တဲ့ school meeting, announcement, event တွေကို မိဘ Portal မှာ ပြပါမယ်။</p>

      <label class="field-label">Event type</label>
      <select class="form-input" id="ppeType">
        <option value="meeting">Parent meeting</option>
        <option value="announcement">Announcement</option>
        <option value="event">School event</option>
        <option value="holiday">Holiday</option>
      </select>

      <label class="field-label">Title</label>
      <input class="form-input" id="ppeTitle" placeholder="ဥပမာ — မိဘဆရာတွေ့ဆုံပွဲ">

      <label class="field-label">Class</label>
      <select class="form-input" id="ppeClass">
        <option value="">Whole school</option>
        ${classes.map(cls => `<option value="${esc(cls)}">${esc(cls)}</option>`).join('')}
      </select>

      <label class="field-label">Start</label>
      <input class="form-input" id="ppeStart" type="datetime-local">

      <label class="field-label">End <span class="optional">optional</span></label>
      <input class="form-input" id="ppeEnd" type="datetime-local">

      <label class="field-label">Description</label>
      <textarea class="form-textarea" id="ppeDesc" rows="3" placeholder="မိဘတွေ သိထားသင့်တဲ့ အချက်များ"></textarea>

      <button class="btn-primary mt16" id="ppeSaveBtn" onclick="saveParentPortalEvent()">Publish to Parent Portal</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
};

window.saveParentPortalEvent = async function() {
  const btn = document.getElementById('ppeSaveBtn');
  const title = document.getElementById('ppeTitle')?.value.trim();
  const start = document.getElementById('ppeStart')?.value;
  const end = document.getElementById('ppeEnd')?.value;
  if (!title || !start) {
    showToast('Title နဲ့ Start time ထည့်ပါ');
    return;
  }
  btn.disabled = true;
  try {
    await API.createParentPortalEvent({
      event_type: document.getElementById('ppeType')?.value,
      title,
      class: document.getElementById('ppeClass')?.value || null,
      starts_at: new Date(start).toISOString(),
      ends_at: end ? new Date(end).toISOString() : null,
      description: document.getElementById('ppeDesc')?.value.trim() || null,
    });
    closeModal();
    showToast('Parent Portal မှာ ထုတ်ပြန်ပြီးပါပြီ');
  } catch (e) {
    btn.disabled = false;
    showToast((t('common.failed') || 'Failed') + ' ' + (e.message || ''));
  }
};

window.openParentCommModal = function() {
  _commPickedStudent = null;
  const classes  = [...new Set(window.APP.students.map(s => s.class).filter(Boolean))].sort();
  const types    = ['General','Absent Alert','Daily Report','Praise','Incident','Homework','Broadcast'];
  // Pre-select whichever list filter was active when "+" was tapped (a head
  // start, not a lock-in) — but it's a real dropdown IN the form now, so
  // typing a message no longer requires having pre-picked the right filter
  // chip first. If the active filter is "All", default to "General".
  const defaultType = types.includes(_commsType) ? _commsType : 'General';

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('comms.sendTitle')}</h3>

      <label class="field-label">${t('comms.purpose')}</label>
      <select class="form-input" id="commType">
        ${types.map(ty => `<option value="${esc(ty)}" ${ty === defaultType ? 'selected' : ''}>${esc(tv('commType', ty))}</option>`).join('')}
      </select>

      <label class="field-label">${t('comms.sendTo')}</label>
      <div class="pill-group" id="commTargetPills">
        <button type="button" class="pill active" data-value="class" onclick="selectCommTarget('class')">${t('comms.wholeClass')}</button>
        <button type="button" class="pill" data-value="student" onclick="selectCommTarget('student')">${t('comms.individual')}</button>
      </div>

      <div id="commClassTarget" class="comm-target-panel is-active" aria-hidden="false">
        <label class="field-label">${t('comms.class')}</label>
        <select class="form-input" id="commClass">
          ${classes.map(c => `<option>${esc(c)}</option>`).join('')}
        </select>
      </div>

      <div id="commStudentTarget" class="comm-target-panel" aria-hidden="true">
        <label class="field-label">${t('comms.student')}</label>
        <button type="button" class="picker-trigger" id="commStuTrigger" onclick="commPickStudent()">
          <span id="commStuTriggerText">${t('comms.chooseStudent')}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <label class="field-label">${t('comms.message')}</label>
      <textarea class="form-textarea" id="commMsg" rows="4" placeholder="${esc(t('comms.msgPh'))}"></textarea>

      <button class="btn-primary mt16" id="sendCommBtn" onclick="sendParentComm()">${t('comms.send')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>`;

  openModal(html);
};

window.selectCommTarget = function(target) {
  const isStudent = target === 'student';
  document.querySelectorAll('#commTargetPills .pill').forEach(p => {
    const active = p.dataset.value === target;
    p.classList.toggle('active', active);
    p.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const classPanel = document.getElementById('commClassTarget');
  const studentPanel = document.getElementById('commStudentTarget');
  if (classPanel) {
    classPanel.classList.toggle('is-active', !isStudent);
    classPanel.setAttribute('aria-hidden', isStudent ? 'true' : 'false');
  }
  if (studentPanel) {
    studentPanel.classList.toggle('is-active', isStudent);
    studentPanel.setAttribute('aria-hidden', isStudent ? 'false' : 'true');
  }
};

window.toggleCommTarget = window.selectCommTarget;

window.commPickStudent = function() {
  // Keep the parent-message form underneath the picker. Do not serialize
  // and reopen the form: doing that used to create duplicate modal layers,
  // losing form state and requiring multiple Close taps.
  openStudentPicker({
    title: t('comms.pickerTitle'),
    onPick: (s) => {
      _commPickedStudent = s;
      selectCommTarget('student');
      const trig = document.getElementById('commStuTriggerText');
      if (trig) trig.textContent = `${s.name_en || s.name_local} (${s.class || '—'})`;
    },
  });
};
window.sendParentComm = async function() {
  const btn = document.getElementById('sendCommBtn');
  const msg = document.getElementById('commMsg').value.trim();
  if (!msg) { showToast(t('comms.msgRequired')); return; }

  const isIndividual = document.querySelector('#commTargetPills .pill.active')?.dataset.value === 'student';
  if (isIndividual && !_commPickedStudent) {
    showToast(t('comms.pickStudentFirst')); return;
  }

  btn.disabled = true; btn.textContent = t('comms.sending');
  try {
       const res = await API.sendParentComm({
      message_preview: msg,
      class:           isIndividual ? (_commPickedStudent?.class || '') : document.getElementById('commClass')?.value,
      student_id:      isIndividual ? _commPickedStudent?.student_id   : null,
      name_en:         isIndividual ? _commPickedStudent?.name_en      : null,
      type:            document.getElementById('commType')?.value || 'General',
      date:            new Date().toISOString().slice(0, 10),
    });
    if (res?.comm) {
      window.APP.parentComms = window.APP.parentComms || [];
      window.APP.parentComms.unshift(res.comm);
      if (typeof _renderCommsList === 'function') _renderCommsList();
    }
    closeModal();
    showToast(t('comms.sent'));
    if (window.APP.tg?.HapticFeedback) window.APP.tg.HapticFeedback.notificationOccurred('success');
  } catch (e) {
    btn.disabled = false; btn.textContent = t('comms.send');
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};
