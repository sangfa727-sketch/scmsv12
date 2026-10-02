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
  _attendNotes = {};
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
  _attendNotes = {};
  _attendNotes = {};
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

  // Pre-fill marks AND notes from persisted attendance data.
  // Notes must be hydrated here; otherwise they disappear whenever the row
  // is re-rendered, the date/class changes, or the app is reopened.
  const existing = window.APP.attendance.filter(
    a => a.class === cls && a.date === _attendDate
  );
  existing.forEach(a => {
    _attendMarks[a.student_id] = a.status;
    if (a.note) _attendNotes[a.student_id] = a.note;
    else delete _attendNotes[a.student_id];
  });

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
    <div class="modal-sheet attendance-form-sheet" onclick="event.stopPropagation()">
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

window.saveAttendNote = async function(studentId) {
  const txt = document.getElementById('attNoteInput')?.value.trim() || '';
  const oldNote = _attendNotes[studentId] || '';
  if (txt === oldNote) {
    closeModal();
    return;
  }

  if (!_attendClass) return;

  const students = window.APP.students.filter(
    s => s.class === _attendClass && s.status === 'Active'
  );
  const existing = window.APP.attendance.filter(
    a => a.class === _attendClass && a.date === _attendDate
  );
  const byStudent = new Map(existing.map(a => [a.student_id, a]));

  // Persist the note immediately using the same atomic attendance save route.
  // Preserve every existing status/note so editing one note never overwrites
  // another student's attendance.
  const records = students.map(s => {
    const row = byStudent.get(s.student_id);
    const isEdited = s.student_id === studentId;
    return {
      student_id: s.student_id,
      status: _attendMarks[s.student_id] || row?.status || 'P',
      note: isEdited ? (txt || null) : (_attendNotes[s.student_id] || row?.note || null),
    };
  });

  try {
    await API.saveAttendance(_attendClass, _attendDate, records);

    _attendNotes[studentId] = txt;
    if (!txt) delete _attendNotes[studentId];

    const kept = window.APP.attendance.filter(
      a => !(a.class === _attendClass && a.date === _attendDate)
    );
    const savedRows = records.map(r => ({
      ...r,
      class: _attendClass,
      date: _attendDate,
      school_id: window.APP.school_id,
      teacher_id: window.APP.teacher_id,
    }));
    window.APP.attendance = [...kept, ...savedRows];

    closeModal();
    _renderAttendGrid(_attendClass);
    if (typeof window.refreshDashboardAttendance === 'function') void window.refreshDashboardAttendance();
    showToast(t(txt ? 'att.noteSaved' : 'att.noteRemoved'));
  } catch (e) {
    showToast(t('att.saveFailed', { err: e.message || t('common.networkError') }));
  }
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


// ─── History / correction / 30-day report ──────────────────────────────────
window.openAttendanceHistory = function() {
  const rows = _attendanceHistoryRows(), report = _attendanceReportSummary();
  openModal(`
    <div class="modal-sheet attendance-history-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div><h3 class="modal-title">${t("att.historyTitle")}</h3>
      <p class="modal-subtitle">${t("att.historyRecent")}</p>
      <div class="att-history-summary">
        <div><strong>${report.days}</strong><span>${t('att.historyDays')}</span></div>
        <div><strong>${report.marked}</strong><span>${t('att.stat.marked')}</span></div>
        <div><strong>${report.presentPct}%</strong><span>${t('att.present')}</span></div>
      </div>
      <div class="att-history-toolbar">
        <button class="btn-pill-action ghost" onclick="openAttendanceAudit()">${t('att.auditTitle')}</button>
        <select class="form-input" id="attHistoryClass">
          <option value="">${t('common.all')}</option>
          ${_attendanceClasses().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
        <button class="btn-pill-action ghost" onclick="renderAttendanceHistoryRows()">${t('btn.refresh')}</button>
      </div>
      <div id="attHistoryRows">${rows}</div>
      <div class="att-history-report"><div class="att-history-report-title">${t("att.report30")}</div>
        <div class="att-report-grid">
          <span>${t('att.present')} <b>${report.P}</b></span><span>${t('att.absent')} <b>${report.A}</b></span>
          <span>${t('att.code.T.label')} <b>${report.L}</b></span><span>${t('att.code.S.label')} <b>${report.S}</b></span>
          <span>${t('att.code.E.label')} <b>${report.E}</b></span><span>${t('att.code.H.label')} <b>${report.H}</b></span>
        </div>
      </div>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>`);
};
function _attendanceClasses(){return [...new Set((window.APP.students||[]).map(s=>s.class).filter(Boolean))].sort();}
function _attendanceHistoryRows(){
  const data=(window.APP.attendance||[]).filter(a=>a&&a.date&&a.class), cls=document.getElementById('attHistoryClass')?.value||'', grouped=new Map();
  data.forEach(a=>{if(cls&&a.class!==cls)return;const k=a.date+'|'+a.class;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(a);});
  const groups=[...grouped.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,20);
  if(!groups.length)return `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">${esc(t('att.historyEmpty'))}</div></div>`;
  return `<div class="att-history-list">${groups.map(([key,items])=>{
    const [date,className]=key.split('|'), counts=items.reduce((m,x)=>(m[x.status]=(m[x.status]||0)+1,m),{});
    return `<div class="att-history-item"><div class="att-history-main"><strong>${esc(className)}</strong><span>${esc(fmtDateLong(date))}</span></div>
      <div class="att-history-counts"><span>P ${counts.P||0}</span><span>A ${counts.A||0}</span><span>L ${counts.L||0}</span><span>S ${counts.S||0}</span></div>
      <button class="btn-secondary att-history-edit" onclick="correctAttendance('${esc(className)}','${esc(date)}')">${t('common.edit')}</button></div>`;
  }).join('')}</div>`;
}
window.renderAttendanceHistoryRows=function(){const el=document.getElementById('attHistoryRows');if(el)el.innerHTML=_attendanceHistoryRows();};

window.openAttendanceAudit = async function() {
  if (window.APP.platform !== 'web') {
    showToast(t("att.auditWebOnly"));
    return;
  }
  openModal(`
    <div class="modal-sheet attendance-history-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t("att.auditTitle")}</h3>
      <p class="modal-subtitle">${t("att.auditSubtitle")}</p>
      <div class="att-history-toolbar">
        <select class="form-input" id="attAuditClass">
          <option value="">${t('common.all')}</option>
          ${_attendanceClasses().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
        <button class="btn-pill-action ghost" onclick="loadAttendanceAudit()">${t('btn.refresh')}</button>
      </div>
      <div id="attAuditRows"><div class="empty-state"><div class="empty-state-icon">🛡️</div><div class="empty-state-text">${esc(t("att.auditLoading"))}</div></div></div>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>`);
  await loadAttendanceAudit();
};
window.loadAttendanceAudit = async function() {
  const el = document.getElementById('attAuditRows');
  if (!el) return;
  const className = document.getElementById('attAuditClass')?.value || null;
  el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">${esc(t("att.auditLoading"))}</div></div>`;
  try {
    const rows = await API.getAttendanceAudit({ className, limit: 100 });
    if (!rows.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🛡️</div><div class="empty-state-text">${t("att.auditEmpty")}</div></div>';
      return;
    }
    el.innerHTML = `<div class="att-history-list">${rows.map(r => `
      <div class="att-history-item">
        <div class="att-history-main"><strong>${esc(r.class || '—')}</strong><span>${esc(r.date || '—')} · ${esc(new Date(r.ts).toLocaleString())}</span></div>
        <div class="att-history-counts"><span>${esc(r.records_count)} records</span><span>${esc(r.actor || '—')}</span></div>
      </div>`).join('')}</div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">${esc(e.message || t('att.auditLoadFailed'))}</div></div>`;
  }
};

window.correctAttendance=function(cls,date){
  closeModal();_attendClass=cls;_attendDate=date;_attendMarks={};_attendNotes={};_stripAnchor=new Date(date+'T00:00:00');
  _renderDateStrip();_renderAttendClassChips();
  setTimeout(()=>{document.getElementById('page-attend')?.scrollIntoView({behavior:'smooth',block:'start'});showToast(t('att.correctionMode'));},120);
};
function _attendanceReportSummary(){
  const data=window.APP.attendance||[], cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-29);
  const counts={P:0,A:0,L:0,T:0,S:0,E:0,H:0};
  data.forEach(a=>{if(!a?.date||new Date(a.date+'T00:00:00')<cutoff)return;if(counts[a.status]!==undefined)counts[a.status]++;});
  const marked=Object.values(counts).reduce((a,b)=>a+b,0);
  return {...counts,marked,days:new Set(data.filter(a=>a?.date&&new Date(a.date+'T00:00:00')>=cutoff).map(a=>a.date)).size,presentPct:marked?Math.round(counts.P/marked*100):0};
}


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
