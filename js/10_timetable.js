/**
 * SCMS v11 — 10_timetable.js
 * Weekly timetable view with day tabs.
 */

'use strict';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
let _ttDay = DAYS[Math.min(Math.max(new Date().getDay() - 1, 0), 4)];

function renderTimetable() {
  _renderDayTabs();
  _renderTtClassChips();
}

function _renderDayTabs() {
  const el = document.getElementById('dayTabs');
  if (!el) return;

  const today = DAYS[Math.min(Math.max(new Date().getDay() - 1, 0), 4)];

  el.innerHTML = DAYS.map(d => `
    <button class="day-tab ${d === _ttDay ? 'active' : ''} ${d === today ? 'today' : ''}"
      data-day="${d}" onclick="selectTtDay('${d}')">${d.slice(0,3)}</button>
  `).join('');
}

window.selectTtDay = function(day) {
  _ttDay = day;
  document.querySelectorAll('.day-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.day === day)
  );
  _renderTtList();
};

function _renderTtClassChips() {
  const el = document.getElementById('ttClassChips');
  if (!el) return;
  el.innerHTML = '';
  _renderTtList();
}

function _renderTtList() {
  const el = document.getElementById('timetableList');
  if (!el) return;

  const entries = window.APP.timetable.filter(t => t.day === _ttDay)
    .sort((a, b) => (a.period || 0) - (b.period || 0));

  if (!entries.length) {
    el.innerHTML = emptyState('📅', t('tt.noClasses', { day: _ttDay }), t('tt.adminManages'));
    return;
  }

  el.innerHTML = entries.map(row => `
    <div class="tt-row" data-tt-id="${esc(row.id)}">
      <div class="tt-period">${esc(String(row.period || '?'))}</div>
      <div class="tt-info">
        <div class="tt-subject">${esc(row.subject ? tv('subject', row.subject) : '—')}</div>
        <div class="tt-meta">${esc(row.class || '—')} ${row.room ? '· ' + esc(t('tt.room', { n: row.room })) : ''}</div>
      </div>
      <div class="tt-time">${esc(row.start_time || '')}</div>
      ${window.APP.is_admin ? `
      <div class="card-actions">
        <button class="icon-btn-mini" onclick="openEditTimetable('${esc(row.id)}')" title="${esc(t('common.edit'))}">✎</button>
        <button class="icon-btn-mini danger" onclick="confirmDeleteTimetable('${esc(row.id)}')" title="${esc(t('btn.delete'))}">🗑</button>
      </div>` : ''}
    </div>`
  ).join('');

  const sub = document.getElementById('timetableSubtitle');
  if (sub) sub.textContent = t(entries.length === 1 ? 'tt.period1' : 'tt.periods', { n: entries.length, day: _ttDay });
}

/* ─── Add / Edit / Delete ──────────────────────────────────────── */

window.openAddTimetable = function() {
  if (!window.APP.is_admin) { showToast(t('tt.adminOnly')); return; }
  _openTimetableForm({ mode: 'add', entry: { day: _ttDay } });
};

window.openEditTimetable = function(id) {
  if (!window.APP.is_admin) { showToast(t('tt.adminOnly')); return; }
  const entry = window.APP.timetable.find(x => String(x.id) === String(id));
  if (!entry) { showToast(t('tt.entryNotFound')); return; }
  _openTimetableForm({ mode: 'edit', entry });
};

function _openTimetableForm({ mode, entry }) {
  const isEdit = mode === 'edit';
  const e = entry || {};
  const subjects = window.APP.config?.subjects || ['Mathematics','English','Science','Social Studies'];
  const classes  = window.getClassList ? window.getClassList()
                   : [...new Set(window.APP.students.map(s => s.class).filter(Boolean))].sort();

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t(isEdit ? 'tt.editTitle' : 'tt.addTitle')}</h3>

      <label class="field-label">${t('tt.day')}</label>
      <select class="form-input" id="ttDay">
        ${DAYS.map(d => `<option ${d===e.day?'selected':''}>${esc(d)}</option>`).join('')}
      </select>

      <div class="form-row">
        <div class="form-col">
          <label class="field-label">${t('tt.periodLbl')}</label>
          <input class="form-input" id="ttPeriod" type="number" min="1" max="12" value="${esc(e.period || '')}">
        </div>
        <div class="form-col">
          <label class="field-label">${t('tt.startTime')}</label>
          <input class="form-input" id="ttStart" type="time" value="${esc(e.start_time || '')}">
        </div>
      </div>

      <label class="field-label">${t('tt.class')}</label>
      <select class="form-input" id="ttClass">
        ${classes.map(c => `<option ${c===e.class?'selected':''}>${esc(c)}</option>`).join('')}
      </select>

      <label class="field-label">${t('tt.subject')}</label>
      <select class="form-input" id="ttSubject">
        ${subjects.map(s => `<option value="${esc(s)}" ${s===e.subject?'selected':''}>${esc(tv('subject', s))}</option>`).join('')}
      </select>

      <label class="field-label">${t('tt.roomOptional')}</label>
      <input class="form-input" id="ttRoom" value="${esc(e.room || '')}" placeholder="${esc(t('tt.roomPh'))}">

      <button class="btn-primary mt16" id="saveTtBtn" onclick="saveTimetableEntry(${isEdit ? `'${esc(e.id)}'` : 'null'})">
        ${t(isEdit ? 'common.saveChanges' : 'tt.addEntry')}
      </button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
}

window.saveTimetableEntry = async function(id) {
  const btn = document.getElementById('saveTtBtn');
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    const data = {
      day:        document.getElementById('ttDay').value,
      period:     parseInt(document.getElementById('ttPeriod').value, 10) || 1,
      start_time: document.getElementById('ttStart').value || null,
      class:      document.getElementById('ttClass').value,
      subject:    document.getElementById('ttSubject').value,
      room:       document.getElementById('ttRoom').value.trim() || null,
    };
    if (id) {
      await API.updateTimetable(id, data);
      const idx = window.APP.timetable.findIndex(x => String(x.id) === String(id));
      if (idx >= 0) window.APP.timetable[idx] = { ...window.APP.timetable[idx], ...data };
      showToast(t('tt.updated'));
    } else {
            const res = await API.saveTimetable(data);
      const newRow = res?.entry || (res && (res.data || res[0])) || { ...data, id: 'tmp_' + Date.now() };
      window.APP.timetable.push(newRow);
      showToast(t('tt.added'));
    }
    closeModal();
    _renderTtList();
  } catch (e) {
    btn.disabled = false; btn.textContent = t(id ? 'common.saveChanges' : 'tt.addEntry');
    showToast(t('att.saveFailed', { err: e.message || t('common.error') }));
  }
};

window.confirmDeleteTimetable = function(id) {
  showConfirm(
    t('tt.confirmDelete'),
    t('common.cantUndo'),
    t('btn.delete'),
    () => doDeleteTimetable(id)
  );
};

async function doDeleteTimetable(id) {
  try {
    await API.deleteTimetable(id);
    window.APP.timetable = window.APP.timetable.filter(x => String(x.id) !== String(id));
    _renderTtList();
    showToast(t('common.deleted'));
  } catch (e) {
    showToast(t('common.deleteFailed', { err: e.message || t('common.error') }));
  }
}
