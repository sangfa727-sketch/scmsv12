/**
 * SCMS v11 — 05_attendance.js
 * Attendance marking: class picker → student grid → save via n8n RPC.
 *
 * NEW in v11:
 *   • Full code set P/A/L/T/S/E/H exposed (was only 5)
 *   • Each code button shows a friendly mini-label underneath (Pres / Abs / Lv / Late / Sick / Exc / ½ day)
 *   • Long-press / "?" header button opens a Legend sheet explaining what each code means
 *   • Bulk-mark toolbar: "All Present" / "Clear marks" — saves clicks for large classes
 *   • Avatars use the student's home colour (matches the Students page)
 */

'use strict';

let _attendClass   = null;
let _attendDate    = new Date().toISOString().slice(0, 10);
let _attendMarks   = {};   // { student_id: status_code }
let _attendNotes   = {};   // { student_id: note_text }
let _stripAnchor   = new Date();   // last (rightmost) day shown in the date strip

function renderAttendance() {
  _renderDateStrip();
  _renderAttendClassChips();
  _renderAttendStats();
}

// ─── Date strip (7 days ending at _stripAnchor, navigable by week) ─────────

function _renderDateStrip() {
  const strip = document.getElementById('dateStrip');
  const label = document.getElementById('dateStripLabel');
  if (!strip) return;
  const todayIso = new Date().toISOString().slice(0, 10);
  let html = '';
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(_stripAnchor);
    d.setDate(_stripAnchor.getDate() - i);
    days.push(d);
    const iso = d.toISOString().slice(0, 10);
    const day = d.toLocaleDateString(I18N.dateLocale(), { weekday: 'short' });
    const num = d.getDate();
    const active = iso === _attendDate ? ' active' : '';
    const isToday = iso === todayIso ? ' today' : '';
    html += `<button class="date-chip${active}${isToday}" onclick="selectAttendDate('${iso}')">${day}<span>${num}</span></button>`;
  }
  strip.innerHTML = html;

  if (label) {
    const first = days[0], last = days[6];
    const fm = first.toLocaleDateString(I18N.dateLocale(), { month: 'short' });
    const lm = last.toLocaleDateString(I18N.dateLocale(), { month: 'short' });
    label.textContent = (fm === lm)
      ? last.toLocaleDateString(I18N.dateLocale(), { month: 'long', year: 'numeric' })
      : `${fm} – ${lm} ${last.getFullYear()}`;
  }
}

window.selectAttendDate = function(iso) {
  _attendDate  = iso;
  _attendMarks = {};
  _renderDateStrip();
  if (_attendClass) _renderAttendGrid(_attendClass);
};

window.shiftDateStrip = function(dir) {
  _stripAnchor.setDate(_stripAnchor.getDate() + dir * 7);
  _renderDateStrip();
};

window.resetDateStripToToday = function() {
  _stripAnchor = new Date();
  _attendDate  = new Date().toISOString().slice(0, 10);
  _attendMarks = {};
  _renderDateStrip();
  if (_attendClass) _renderAttendGrid(_attendClass);
};

// ─── Class chips ──────────────────────────────────────────────────────────

function _renderAttendClassChips() {
  const el = document.getElementById('attendClassChips');
  if (!el) return;

  const classes = [...new Set(
    window.APP.students
      .filter(s => s.status === 'Active')
      .map(s => s.class).filter(Boolean)
  )].sort();

  if (!classes.length) {
    el.innerHTML = `<span class="chip-empty">${esc(t('att.noClasses'))}</span>`;
    return;
  }

  if (!_attendClass || !classes.includes(_attendClass)) _attendClass = classes[0];

    el.innerHTML = `
    <div class="attend-class-select-wrap">
      <select class="attend-class-select" onchange="selectAttendClass(this.value)">
        ${classes.map(c => `<option value="${esc(c)}"${c === _attendClass ? ' selected' : ''}>${esc(t('att.classOption', { name: c }))}</option>`).join('')}
      </select>
    </div>`;

  _renderAttendGrid(_attendClass);
}

window.selectAttendClass = function(cls) {
  _attendClass = cls;
  _attendMarks = {};
  document.querySelectorAll('#attendClassChips .chip').forEach(b => {
    b.classList.toggle('active', b.dataset.class === cls);
  });
  _renderAttendGrid(cls);
};

// ─── Attendance code list (the 7 codes) ───────────────────────────────────

function _getAttendanceCodes() {
  // Server config wins if it defines codes; otherwise fall back to the full set
  const configCodes = window.APP.config?.attendance_codes;
  const fallback = ['P', 'A', 'L', 'T', 'S', 'E', 'H'].map(code => ({
    code,
    label: window.ATTENDANCE_CODE_LABELS[code].label,
    color: window.ATTENDANCE_CODE_LABELS[code].color,
  }));

  if (!Array.isArray(configCodes) || !configCodes.length) return fallback;

  // Ensure every server code has a label/color (server may only send `code`)
  return configCodes.map(c => ({
    code:  c.code,
    label: c.label || window.ATTENDANCE_CODE_LABELS[c.code]?.label || c.code,
    color: c.color || window.ATTENDANCE_CODE_LABELS[c.code]?.color || '#8A8A82',
  }));
}

// ─── Attendance grid ──────────────────────────────────────────────────────

function _renderAttendGrid(cls) {
  const el = document.getElementById('attendList');
  if (!el) return;

  const students = window.APP.students.filter(s => s.class === cls && s.status === 'Active');
  if (!students.length) {
    el.innerHTML = emptyState('📋', t('att.noActive', { cls }));
    return;
  }

  // Pre-fill marks from existing attendance data
  const existing = window.APP.attendance.filter(
    a => a.class === cls && a.date === _attendDate
  );
  existing.forEach(a => { _attendMarks[a.student_id] = a.status; });

  const codes = _getAttendanceCodes();

  

  const rows = students.map(s => {
    const current  = _attendMarks[s.student_id] || '';
    const note     = _attendNotes[s.student_id] || '';
    const homeHex  = s.home_color ? homeColorHex(s.home_color) : _classColor(s.class);
    const initials = (s.name_en || s.name_local || '?').slice(0, 1).toUpperCase();

    const btns = codes.map(c => {
      const sel = c.code === current ? ' sel' : '';
      const desc = window.ATTENDANCE_CODE_LABELS[c.code]?.label || c.label;
      return `
        <button class="att-code-pill${sel}" data-code="${esc(c.code)}"
          onclick="markAttend('${esc(s.student_id)}','${esc(c.code)}')"
          title="${esc(desc)}"
          aria-label="${esc(desc)}">
      ${esc(desc)}
        </button>`;
    }).join('');

    const noteIndicator = note
      ? `<span class="att-note-dot" title="${esc(t('att.hasNote', { note }))}">📝</span>`
      : '';

    return `
      <div class="attend-row-clean" id="arow-${esc(s.student_id)}" data-marked="${current ? '1' : '0'}">
        <div class="att-row-head">
          <span class="att-avatar-sm" style="background:${homeHex}">${avatarContent(s)}</span>
          <span class="att-row-name">${esc(s.name_en || s.name_local || s.student_id)}</span>
          ${noteIndicator}
          <button class="att-note-btn" onclick="openAttendNote('${esc(s.student_id)}')" aria-label="${esc(t('att.noteAdd'))}" title="${esc(t('att.noteAddTitle'))}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
        </div>
        <div class="att-codes-row" role="radiogroup" aria-label="${esc(t('att.codeGroup'))}">${btns}</div>
      </div>`;
  }).join('');

    el.innerHTML = `<div class="attend-list-wrap">${rows}</div>`;

  _renderAttendStats();
}

window.markAttend = function(studentId, code) {
  _attendMarks[studentId] = code;
  const row = document.getElementById(`arow-${studentId}`);
  if (row) {
    row.dataset.marked = '1';
    row.querySelectorAll('.att-code-pill').forEach(b => {
      b.classList.toggle('sel', b.dataset.code === code);
    });
  }
  _renderAttendStats();

  if (window.APP.tg?.HapticFeedback) {
    window.APP.tg.HapticFeedback.selectionChanged();
  }
};

/**
 * Add a free-text note (e.g. "Sick — went to doctor", "Late due to bus")
 * alongside the attendance code. Saved with the same payload.
 */
window.openAttendNote = function(studentId) {
  const student = window.APP.students.find(s => s.student_id === studentId);
  if (!student) return;
  const currentNote = _attendNotes[studentId] || '';
  const currentCode = _attendMarks[studentId] || '';
  const codeLabel = currentCode ? attendCodeLabel(currentCode) : t('att.notMarkedYet');

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${esc(t('att.noteTitle', { name: student.name_en || student.name_local }))}</h3>
      <p class="modal-subtitle">${esc(t('att.currentStatus'))} <strong>${esc(codeLabel)}</strong> · ${esc(fmtDateLong(_attendDate))}</p>
      <label class="form-label">${t('att.reasonLabel')}</label>
      <textarea class="form-input" id="attNoteInput" rows="3"
        placeholder="${esc(t('att.reasonPh'))}"
        maxlength="200">${esc(currentNote)}</textarea>
      <div class="form-help">${esc(t('att.charCount', { n: currentNote.length }))}</div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
        <button class="btn-primary" onclick="saveAttendNote('${esc(studentId)}')">${t('att.saveNote')}</button>
      </div>
    </div>
  `);
  setTimeout(() => document.getElementById('attNoteInput')?.focus(), 100);
};

window.saveAttendNote = function(studentId) {
  const txt = document.getElementById('attNoteInput')?.value.trim() || '';
  if (txt) _attendNotes[studentId] = txt;
  else delete _attendNotes[studentId];
  closeModal();
  if (_attendClass) _renderAttendGrid(_attendClass);
  showToast(t(txt ? 'att.noteSaved' : 'att.noteRemoved'));
};

window.markAllAttend = function(code) {
  if (!_attendClass) return;
  const students = window.APP.students.filter(s => s.class === _attendClass && s.status === 'Active');
  students.forEach(s => { _attendMarks[s.student_id] = code; });
  _renderAttendGrid(_attendClass);
  showToast(t('att.markedAll', { label: attendCodeLabel(code) }));
  if (window.APP.tg?.HapticFeedback) window.APP.tg.HapticFeedback.impactOccurred('medium');
};

window.clearAllAttend = function() {
  _attendMarks = {};
  _attendNotes = {};
  if (_attendClass) _renderAttendGrid(_attendClass);
  showToast(t('att.cleared'));
};

window.showAttendLegend = function() {
  const codes = _getAttendanceCodes();
  const rows = codes.map(c => {
    const desc = window.ATTENDANCE_CODE_LABELS[c.code]?.desc || '';
    return `
      <div class="legend-row">
        <span class="legend-code" style="--att-color:${c.color}">${esc(c.code)}</span>
        <div class="legend-text">
          <div class="legend-label">${esc(c.label)}</div>
          ${desc ? `<div class="legend-desc">${esc(desc)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('att.legendTitle')}</h3>
      <p style="color:var(--muted); font-size:13px; line-height:1.6; margin-bottom:16px;">
        ${t('att.legendHint')}
      </p>
      <div class="legend-grid">${rows}</div>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('att.gotIt')}</button>
    </div>`;
  openModal(html);
};

// ─── Helper: class colour fallback ────────────────────────────────────────

function _classColor(cls) {
  const colors = ['#4F46E5','#0891B2','#059669','#D97706','#DC2626','#7C3AED','#DB2777'];
  if (!cls) return colors[0];
  return colors[cls.charCodeAt(0) % colors.length];
}

// ─── Stats bar ─────────────────────────────────────────────────────────────

function _renderAttendStats() {
  const el = document.getElementById('attendStats');
  if (!el || !_attendClass) return;

  const students = window.APP.students.filter(s => s.class === _attendClass && s.status === 'Active');
  const total   = students.length;
  const marked  = Object.keys(_attendMarks).length;
  const counts  = { P: 0, A: 0, L: 0, T: 0, S: 0, E: 0, H: 0 };
  Object.values(_attendMarks).forEach(v => { if (counts[v] !== undefined) counts[v]++; });
  const present = counts.P;
  const absent  = counts.A + counts.S;
  const pct     = total ? Math.round((marked / total) * 100) : 0;

  const breakdown = [
    { code: 'L', label: attendCodeLabel('L'), n: counts.L },
    { code: 'T', label: attendCodeLabel('T'), n: counts.T },
    { code: 'S', label: attendCodeLabel('S'), n: counts.S },
    { code: 'E', label: attendCodeLabel('E'), n: counts.E },
    { code: 'H', label: attendCodeLabel('H'), n: counts.H },
  ];
  const hasBreakdown = breakdown.some(b => b.n > 0);
  const breakdownRow = breakdown.map(b => `
    <span class="att-statbar-mini">${b.n} <span>${esc(b.label)}</span></span>
  `).join('');

  el.innerHTML = `
    <div class="att-statbar">
      <div class="att-statbar-item">
        <span class="att-statbar-num">${marked}<span class="att-statbar-of">/${total}</span></span>
        <span class="att-statbar-lbl">${t('att.stat.marked')}</span>
      </div>
      <div class="att-statbar-sep"></div>
      <div class="att-statbar-item att-statbar-green">
        <span class="att-statbar-num">${present}</span>
        <span class="att-statbar-lbl">${t('att.present')}</span>
      </div>
      <div class="att-statbar-sep"></div>
      <div class="att-statbar-item att-statbar-red">
        <span class="att-statbar-num">${absent}</span>
        <span class="att-statbar-lbl">${t('att.absent')}</span>
      </div>
      <button type="button" class="att-statbar-more" onclick="toggleAttendBreakdown(this)">
        ${t('att.stat.more')}${hasBreakdown ? '<span class="att-statbar-more-dot"></span>' : ''}
      </button>
      <div class="att-statbar-progress">
        <div class="att-statbar-progress-fill" style="width:${pct}%"></div>
      </div>
    </div>
    <div class="att-statbar-breakdown" id="attendStatsBreakdown" hidden>${breakdownRow}</div>
  `;
}

window.toggleAttendBreakdown = function(btn) {
  const row = document.getElementById('attendStatsBreakdown');
  if (!row) return;
  const wasHidden = row.hasAttribute('hidden');
  if (wasHidden) row.removeAttribute('hidden'); else row.setAttribute('hidden', '');
  btn.classList.toggle('open', wasHidden);
};

// ─── Save attendance ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnSaveAttendance');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!_attendClass) { showToast(t('att.selectClassFirst')); return; }

    const students = window.APP.students.filter(s => s.class === _attendClass && s.status === 'Active');
    if (!students.length) { showToast(t('att.noStudentsInClass')); return; }

    const records = students.map(s => ({
      student_id: s.student_id,
      status:     _attendMarks[s.student_id] || 'P',
      note:       _attendNotes[s.student_id] || null,
    }));

    btn.disabled = true;
    btn.textContent = t('common.saving');

    try {
      await API.saveAttendance(_attendClass, _attendDate, records);

      const existing = window.APP.attendance.filter(
        a => !(a.class === _attendClass && a.date === _attendDate)
      );
      const newRows = records.map(r => ({
        ...r,
        class:      _attendClass,
        date:       _attendDate,
        school_id:  window.APP.school_id,
        teacher_id: window.APP.teacher_id,
      }));
      window.APP.attendance = [...existing, ...newRows];

      showToast(t('att.saved', { cls: _attendClass, date: _attendDate }));
      _renderAttendStats();

      if (window.APP.tg?.HapticFeedback) {
        window.APP.tg.HapticFeedback.notificationOccurred('success');
      }
    } catch (e) {
      showToast(t('att.saveFailed', { err: e.message || t('common.networkError') }));
      if (window.APP.tg?.HapticFeedback) {
        window.APP.tg.HapticFeedback.notificationOccurred('error');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-2px">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
      </svg>${t('att.saveAttendance')}`;
    }
  });
});
