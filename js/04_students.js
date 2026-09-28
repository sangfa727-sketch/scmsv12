/**
 * SCMS v11 — 04_students.js
 * Student roster: list, search, filter by class, add/edit/view, parent deep-link.
 *
 * NEW in v11:
 *   • Tap card → opens RICH detail view with EDIT button (was read-only)
 *   • Add-student form gains: birthday, parent email, home colour
 *   • Parent TG ID is captured AUTOMATICALLY via a deep-link the teacher shares
 *     with the parent — no more manual ID entry
 *   • All previous logic preserved (search, class chip filter, etc.)
 */

'use strict';

let _stuClass  = 'All';
let _stuSearch = '';
let _parentLinkPollTimer = null;   // polls server after registering a student
let _pendingPhotoFile    = null;   // File picked in the Add/Edit form, uploaded on save
let _removePhotoRequested = false; // "Remove photo" tapped — clear on save

function renderStudents() {
  _renderStudentStats();
  _renderClassChips();
  _renderIdSelectToolbar();
  _renderStudentList();
}

// ─── Select-for-print (ID cards) ────────────────────────────────────────────

let _idSelectMode = false;
let _idSelected    = new Set();

window.toggleIdSelectMode = function() {
  _idSelectMode = !_idSelectMode;
  if (!_idSelectMode) _idSelected.clear();
  _renderIdSelectToolbar();
  _renderStudentList();
};

window._idToggleOne = function(studentId) {
  if (_idSelected.has(studentId)) _idSelected.delete(studentId); else _idSelected.add(studentId);
  _renderIdSelectToolbar();
};

window.idSelectAllVisible = function() {
  _visibleStudentIds().forEach(id => _idSelected.add(id));
  _renderIdSelectToolbar();
  _renderStudentList();
};

window.idSelectNone = function() {
  _idSelected.clear();
  _renderIdSelectToolbar();
  _renderStudentList();
};

function _visibleStudentIds() {
  // Same filtering _renderStudentList uses, kept in sync deliberately —
  // "select all" means "all in the current class/search view", not everyone.
  let list = window.APP.students.filter(s => s.status === 'Active');
  if (_stuClass !== 'All') list = list.filter(s => s.class === _stuClass);
  if (_stuSearch) {
    list = list.filter(s =>
      (s.name_en    || '').toLowerCase().includes(_stuSearch) ||
      (s.name_local || '').toLowerCase().includes(_stuSearch) ||
      (s.student_id || '').toLowerCase().includes(_stuSearch) ||
      (s.class      || '').toLowerCase().includes(_stuSearch));
  }
  return list.map(s => s.student_id);
}

function _renderIdSelectToolbar() {
  const el = document.getElementById('idSelectToolbar');
  if (!el) return;

  if (!_idSelectMode) {
    el.innerHTML = `<button class="btn-pill-action ghost" onclick="toggleIdSelectMode()">🪪 ${t('idCard.selectMode')}</button>`;
    return;
  }
  el.innerHTML = `
    <span class="id-select-count">${t('idCard.nSelected', { n: _idSelected.size })}</span>
    ${_orientSegHtml()}
    <button class="btn-pill-action ghost" onclick="idSelectAllVisible()">${t('idCard.selectAllVisible')}</button>
    ${_idSelected.size ? `<button class="btn-pill-action ghost" onclick="idSelectNone()">${t('idCard.selectNone')}</button>` : ''}
    <button class="btn-pill-action" ${_idSelected.size ? '' : 'disabled style="opacity:.4"'} onclick="printSelectedIdCards()">🖨️ ${t('idCard.printSelected')}</button>
    <button class="btn-pill-action ghost" onclick="toggleIdSelectMode()">${t('common.cancel')}</button>
  `;
}

window.printSelectedIdCards = async function() {
  const ids = [..._idSelected];
  if (!ids.length) return;

  showToast(t('idCard.preparing', { n: ids.length }));
  let students;
  try {
    // Each call gets-or-creates that student's QR token (idempotent — same
    // token returned if one already exists), same endpoint the single-card
    // view uses, just run for everyone selected at once.
    const results = await Promise.all(ids.map(id => API.getOrCreateStudentQr(id)));
    students = results.map(r => r.student);
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
    return;
  }

  const area = document.getElementById('bulkIdPrintArea');
  if (!area) return;

  const PER_PAGE = _idCardOrientation === 'vertical' ? 9 : 10; // 3x3 vertical vs 2x5 horizontal, both fit A4 with margins
  const pageClass = _idCardOrientation === 'vertical' ? 'id-sheet-page vertical' : 'id-sheet-page';
  const pages = [];
  for (let i = 0; i < students.length; i += PER_PAGE) pages.push(students.slice(i, i + PER_PAGE));

  area.innerHTML = pages.map((page, pi) => `
    <div class="${pageClass}">
      ${page.map((s, si) => _idCardHtml(s, `bulkQr_${pi}_${si}`)).join('')}
    </div>`).join('');

  // QRCode needs the target element already in the DOM — instantiate after innerHTML is set.
  pages.forEach((page, pi) => page.forEach((s, si) => {
    const portalUrl = new URL('parent.html?t=' + encodeURIComponent(s.qr_token), location.href).href;
    const target = document.getElementById(`bulkQr_${pi}_${si}`);
    if (window.QRCode && target) {
      new QRCode(target, { text: portalUrl, width: 256, height: 256, colorDark: '#1A1A18', colorLight: '#ffffff' });
    }
  }));

  _printArea('printing-id-bulk', 'size: A4; margin: 6mm;', () => { area.innerHTML = ''; });
};

// ─── Stats ────────────────────────────────────────────────────────────────

function _renderStudentStats() {
  const el = document.getElementById('studentStats');
  if (!el) return;

  const active   = window.APP.students.filter(s => s.status === 'Active').length;
  const classes  = new Set(window.APP.students.map(s => s.class).filter(Boolean)).size;
  const today    = new Date().toISOString().slice(0, 10);
  const presents = window.APP.attendance.filter(a => a.date === today && a.status === 'P').length;

  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${active}</div>
      <div class="stat-lbl">${t('students.stat.students')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${classes}</div>
      <div class="stat-lbl">${t('students.stat.classes')}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-num">${presents}</div>
      <div class="stat-lbl">${t('students.stat.hereToday')}</div>
    </div>
  `;

  const subtitle = document.getElementById('studentsSubtitle');
  if (subtitle) subtitle.textContent = t(
    active === 1 && classes === 1 ? 'students.subtitleOne'
      : classes === 1 ? 'students.subtitleOneClass' : 'students.subtitle',
    { n: active, c: classes });
}

// ─── Class filter chips ────────────────────────────────────────────────────

function _renderClassChips() {
  const el = document.getElementById('classChips');
  if (!el) return;

  const classes = ['All', ...[...new Set(
    window.APP.students.filter(s => s.status === 'Active').map(s => s.class).filter(Boolean)
  )].sort()];

  el.innerHTML = classes.map(c =>
    `<button class="chip${c === _stuClass ? ' active' : ''}" data-class="${esc(c)}" onclick="filterStuClass('${esc(c)}')">${esc(c)}</button>`
  ).join('');
}

window.filterStuClass = function(cls) {
  _stuClass = cls;
  document.querySelectorAll('#classChips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.class === cls)
  );
  _renderStudentList();
};

// ─── Search ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('studentSearchInput');
  const clear = document.getElementById('studentSearchClear');
  if (!input) return;

  input.addEventListener('input', () => {
    _stuSearch = input.value.trim().toLowerCase();
    clear.style.display = _stuSearch ? 'flex' : 'none';
    _renderStudentList();
  });

  clear.addEventListener('click', () => {
    input.value = '';
    _stuSearch  = '';
    clear.style.display = 'none';
    _renderStudentList();
  });
});

// ─── Student list ──────────────────────────────────────────────────────────

function _renderStudentList() {
  const el = document.getElementById('studentList');
  if (!el) return;

  let list = window.APP.students.filter(s => s.status === 'Active');

  if (_stuClass !== 'All') {
    list = list.filter(s => s.class === _stuClass);
  }
  if (_stuSearch) {
    list = list.filter(s =>
      (s.name_en    || '').toLowerCase().includes(_stuSearch) ||
      (s.name_local || '').toLowerCase().includes(_stuSearch) ||
      (s.student_id || '').toLowerCase().includes(_stuSearch) ||
      (s.class      || '').toLowerCase().includes(_stuSearch)
    );
  }

  if (!list.length) {
    el.innerHTML = emptyState('👥', t('students.empty.title'),
      t(_stuSearch ? 'students.empty.searchHint' : 'students.empty.addHint'));
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  el.innerHTML = list.map(s => {
    const att = window.APP.attendance.find(
      a => a.date === today && a.student_id === s.student_id
    );
    const attCode  = att?.status || '—';
    const attColor = attCode === '—' ? '#999' : attendCodeColor(attCode);
    const attLabel = attCode === '—' ? t('students.notMarked') : attendCodeLabel(attCode);
    const homeHex  = s.home_color ? homeColorHex(s.home_color) : _classColor(s.class);
    const bdayDays = daysUntilBirthday(s.date_of_birth);
    const bdaySoon = bdayDays !== null && bdayDays <= 7;

    return `
      <div class="list-card stu-card${_idSelectMode ? ' id-select-mode' : ''}" onclick="${_idSelectMode ? `_idToggleOne('${esc(s.student_id)}')` : `openStudentDetail('${esc(s.student_id)}')`}">
        ${_idSelectMode ? `<input type="checkbox" class="id-select-checkbox" ${_idSelected.has(s.student_id) ? 'checked' : ''} onclick="event.stopPropagation();_idToggleOne('${esc(s.student_id)}')">` : ''}
        <div class="card-row">
          <div class="card-avatar" style="background:${homeHex}">${avatarContent(s)}</div>
          <div class="card-info">
            <div class="card-name">
              ${esc(s.name_en || s.name_local || s.student_id)}
              ${bdaySoon ? `<span class="bday-pill" title="${esc(t(bdayDays === 1 ? 'students.bday.tooltipOne' : 'students.bday.tooltip', { n: bdayDays }))}">🎂 ${bdayDays === 0 ? t('students.bday.today') : t('students.bday.short', { n: bdayDays })}</span>` : ''}
            </div>
            <div class="card-sub">
              <span class="class-tag">${esc(s.class || '—')}</span>
              ${s.name_local && s.name_local !== s.name_en
                ? `<span class="name-local">${esc(s.name_local)}</span>` : ''}
              ${s.home_color ? `<span class="home-dot" style="background:${homeHex}" title="${esc(t('students.homeLabel'))} ${esc(homeColorName(s.home_color))}"></span>` : ''}
            </div>
          </div>
          <div class="card-actions" onclick="event.stopPropagation()">
            <span class="att-pill" style="--pill-color:${attColor}" title="${esc(attLabel)}">${esc(attCode)}</span>
            <button type="button" class="icon-btn-mini" onclick="showStudentIdCard('${esc(s.student_id)}')" title="${esc(t('idCard.title'))}">🪪</button>
          </div>
        </div>
        ${s.parent_name ? `<div class="card-parent">👤 ${esc(s.parent_name)}${s.parent_phone ? ' · ' + esc(s.parent_phone) : ''}${s.parent_tg_id ? ` · <span class="tg-linked">✓ ${t('students.tgLinked')}</span>` : ''}</div>` : ''}
      </div>`;
  }).join('');
}

function _classColor(cls) {
  const colors = ['#4F46E5','#0891B2','#059669','#D97706','#DC2626','#7C3AED','#DB2777'];
  if (!cls) return colors[0];
  return colors[cls.charCodeAt(0) % colors.length];
}

// ─── Student detail (rich view with Edit button) ──────────────────────────

window.openStudentDetail = function(studentId) {
  const s = window.APP.students.find(x => x.student_id === studentId);
  if (!s) return;

  const reports   = window.APP.dailyReports.filter(r => r.student_id === studentId).slice(0, 5);
  const incidents = window.APP.incidents.filter(i => i.student_id === studentId).slice(0, 3);
  const homeHex   = s.home_color ? homeColorHex(s.home_color) : _classColor(s.class);
  const age       = computeAge(s.date_of_birth);

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <div class="detail-header">
               <div class="detail-avatar" style="background:${homeHex}">${avatarContent(s)}</div>
        <div style="flex:1; min-width:0;">
          <h3 class="modal-title mb0">${esc(s.name_en || s.name_local || '—')}</h3>
          ${s.name_local && s.name_local !== s.name_en ? `<div class="detail-local">${esc(s.name_local)}</div>` : ''}
          <div class="detail-meta">
            <span class="class-tag">${esc(s.class || '—')}</span>
            <span class="id-tag">${esc(s.student_id)}</span>
            ${s.home_color ? `<span class="home-tag" style="background:${homeHex}20;color:${homeHex}">● ${esc(homeColorName(s.home_color))}</span>` : ''}
          </div>
        </div>
        <button class="icon-btn-edit" onclick="openEditStudentModal('${esc(s.student_id)}')" title="${esc(t('common.edit'))}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      </div>

      <div class="detail-grid">
        ${_detailRow(t('students.field.gender'),   s.gender || '—')}
        ${_detailRow(t('students.field.grade'),    s.grade  || '—')}
        ${_detailRow(t('students.field.birthday'), s.date_of_birth ? `${fmtDateLong(s.date_of_birth)}${age != null ? ' · ' + age + ' ' + t('common.years') : ''}` : '—')}
        ${_detailRow(t('students.field.home'),     s.home_color ? homeColorName(s.home_color) : '—')}
        ${_detailRow(t('students.field.parent'),        s.parent_name  || '—')}
        ${_detailRow(t('students.field.parentPhone'),  s.parent_phone || '—')}
        ${_detailRow(t('students.field.parentEmail'),  s.parent_email || '—')}
        ${_detailRow(t('students.field.parentTg'), s.parent_tg_id
          ? `<span class="tg-linked">${t('students.linked')}</span>`
          : `<button class="link-btn-inline" onclick="showParentLinkQR('${esc(s.student_id)}')">${t('students.getLink')}</button>`)}
      </div>

      ${reports.length ? `
        <div class="detail-section">${t('students.detail.recentReports')}</div>
        ${reports.map(r => `
          <div class="mini-card">${esc(r.date)} · ${esc(r.mood || '—')} · ${t('students.detail.meal')} ${esc(r.meal || '—')}</div>`).join('')}
      ` : ''}

      ${incidents.length ? `
        <div class="detail-section">${t('students.detail.recentIncidents')}</div>
        ${incidents.map(i => `
          <div class="mini-card incident-card">${esc(i.date)} · ${esc(i.type)} · ${esc(i.severity)}</div>`).join('')}
      ` : ''}

      <button class="btn-primary mt16" onclick="openEditStudentModal('${esc(s.student_id)}')">
        ${t('students.detail.editInfo')}
      </button>
      ${s.status === 'Active' ? `<button class="btn-secondary" onclick="showStudentIdCard('${esc(s.student_id)}')">🪪 ${t('idCard.title')}</button>` : ''}
      ${s.status === 'Active' ? `<button class="btn-secondary" onclick="showHealthRecord('${esc(s.student_id)}')">🏥 ${t('students.btn.health')}</button>` : ''}
      ${s.status === 'Active' ? `<button class="btn-secondary" onclick="showStudentLibrary('${esc(s.student_id)}')">📚 ${t('stuLib.title')}</button>` : ''}
      ${s.status === 'Active' ? `<button class="btn-secondary" onclick="showStudentTransport('${esc(s.student_id)}')">🚌 ${t('stuTr.title')}</button>` : ''}
      <button class="btn-secondary" onclick="closeModal()">${t('common.close')}</button>
    </div>`;

  openModal(html);
};

function _detailRow(label, value) {
  return `<div class="detail-row"><span class="detail-lbl">${esc(label)}</span><span class="detail-val">${value}</span></div>`;
}

/* ─── Student ID Card (Parent Portal QR) ────────────────────────────────
 * Any Active student can get one — the QR encodes a link to parent.html
 * that resolves to this student and lets their parent sign in with the
 * Google account matching parent_email on file. */

// Shared template for both the single-card modal and the bulk print sheet,
// so the two never visually drift apart. `qrTargetId` is the id of an
// (already-in-DOM) element the caller will instantiate a QRCode into right
// after inserting this HTML — this function only lays out the empty slot.
//
// Design v3 — modern & minimal: white card, one ink colour, hairline
// dividers, serif name/school (Fraunces), small-caps labels. No house/class
// colours. Date of birth is deliberately NOT printed: a lost card would
// otherwise carry personal data, and the QR already opens the parent portal
// only after the parent signs in with the Gmail on file.
function _idCardHtml(s, qrTargetId) {
  const vertical = _idCardOrientation === 'vertical';
  const logo   = window.APP.school_logo || (window.APP.config && window.APP.config.school_logo) || '';
  const school = esc(window.APP.school_name || '');
  const brand  = `<div class="idc-brand">${logo ? `<img class="idc-logo" src="${esc(logo)}" alt="">` : ''}<div class="idc-school">${school}</div></div>`;
  const photo  = `<div class="idc-photo">${avatarContent(s)}</div>`;
  const qr     = `<div class="idc-qr" id="${qrTargetId}"></div>`;

  if (vertical) {
    return `
      <div class="id-card id-card-vertical"><div class="idc-face">
        ${brand}
        ${photo}
        <div class="idc-who">
          <div class="idc-name">${esc(s.name_en)}</div>
          <div class="idc-class">${esc(s.class || '')}</div>
          <div class="idc-sid">${esc(s.student_id)}</div>
        </div>
        ${qr}
      </div></div>`;
  }
  return `
    <div class="id-card"><div class="idc-face">
      <div class="idc-left">
        ${photo}
        <div class="idc-name">${esc(s.name_en)}</div>
      </div>
      <div class="idc-right">
        ${brand}
        <div class="idc-field">
          <div class="idc-label">Student ID</div>
          <div class="idc-value idc-sid">${esc(s.student_id)}</div>
        </div>
        <div class="idc-bottom">
          <div class="idc-field">
            <div class="idc-label">Class</div>
            <div class="idc-value">${esc(s.class || '')}</div>
          </div>
          ${qr}
        </div>
      </div>
    </div></div>`;
}

// Orientation is a session-wide choice (not per-student) — pick once via the
// toggle button, it applies to the single-card preview/print AND to the
// next bulk print, until changed again. Defaults to horizontal (the
// original layout).
let _idCardOrientation   = 'horizontal'; // 'horizontal' | 'vertical'
let _idCardCurrentStudent = null;        // so the toggle button can re-render the open modal

function _orientIconSvg(orientation) {
  // The icon is the SHAPE of that orientation (tall = vertical, wide = horizontal).
  return orientation === 'vertical'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/></svg>`;
}

// Two icon-only buttons, the active one highlighted — so it is always clear
// which shape is selected and which one a tap will give you.
function _orientSegHtml() {
  const btn = (o) => {
    const on = _idCardOrientation === o;
    return `<button type="button" class="id-orient-opt${on ? ' on' : ''}" aria-pressed="${on}"
      title="${esc(t(o === 'vertical' ? 'idCard.orientVertical' : 'idCard.orientHorizontal'))}"
      onclick="_setIdCardOrientation('${o}')">${_orientIconSvg(o)}</button>`;
  };
  return `<div class="id-orient-seg" role="group">${btn('horizontal')}${btn('vertical')}</div>`;
}

window._setIdCardOrientation = function(o) {
  if (o !== 'horizontal' && o !== 'vertical') return;
  _idCardOrientation = o;
  if (_idCardCurrentStudent && document.getElementById('idCardBody')) _renderIdCardBody(_idCardCurrentStudent);
  _renderIdSelectToolbar();
};

// Prints exactly one DOM subtree at its true physical size, injecting the
// @page rule fresh per print job (rather than a static stylesheet rule) so
// the single-card size and the bulk A4 sheet size never fight each other.
function _printArea(bodyClass, pageCss, cleanupFn) {
  document.body.classList.add(bodyClass);
  const style = document.createElement('style');
  style.textContent = `@page { ${pageCss} }`;
  document.head.appendChild(style);
  const cleanup = () => {
    document.body.classList.remove(bodyClass);
    style.remove();
    if (cleanupFn) cleanupFn();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

window.showStudentIdCard = async function(studentId) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('idCard.title')}</h3>
      <div id="idCardBody">${skeletonCards(1)}</div>
    </div>
  `);
  await _loadIdCard(studentId);
};

async function _loadIdCard(studentId) {
  const el = document.getElementById('idCardBody');
  if (!el) return;
  let res;
  try {
    res = await API.getOrCreateStudentQr(studentId);
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('idCard.failed', { err: e.message || t('common.error') }))}</div>`;
    return;
  }
  _renderIdCardBody(res.student);
}

function _renderIdCardBody(s) {
  const el = document.getElementById('idCardBody');
  if (!el) return;
  _idCardCurrentStudent = s; // so the orientation toggle can re-render this same card

  // The QR encodes a random, unguessable token (not the plain STU-... ID) —
  // scanning or photographing it only gets someone to the "sign in with the
  // matching parent Gmail" screen; rpc_parent_google_login still checks the
  // signed-in Google account's email against students.parent_email on file,
  // server-side, before it ever issues a session. Card lost/stolen? Use
  // "Issue a new code" below — the old QR stops working immediately.
  const portalUrl = new URL('parent.html?t=' + encodeURIComponent(s.qr_token), location.href).href;
  const pageCss = _idCardOrientation === 'vertical'
    ? 'size: 2.125in 3.375in; margin: 0;'
    : 'size: 3.375in 2.125in; margin: 0;';

  el.innerHTML = `
    <div class="id-card-preview-wrap">
      <div class="id-card-orient-row">${_orientSegHtml()}</div>
      <div id="idCardPrintArea">${_idCardHtml(s, 'idCardQr')}</div>
    </div>
    <p class="muted" style="font-size:12px;text-align:center;margin:10px 0 0">${t('idCard.scanHint')}</p>
    <div class="id-card-link-row">
      <input class="form-input" id="idCardLinkInput" value="${esc(portalUrl)}" readonly onclick="this.select()">
      <button type="button" class="btn-pill-action ghost" onclick="_copyIdCardLink()">${t('idCard.copyLink')}</button>
    </div>
    <p class="muted" style="font-size:11px;text-align:center">${t('idCard.testHint')}</p>
    <button class="btn-primary mt16" onclick="_printArea('printing-id-single', '${pageCss}')">${t('idCard.print')}</button>
    <button class="btn-secondary" onclick="_confirmRegenerateQr('${esc(s.student_id)}')">${t('idCard.lost')}</button>
    <button class="btn-secondary" onclick="closeModal()">${t('common.close')}</button>
  `;

  if (window.QRCode) {
    new QRCode(document.getElementById('idCardQr'), {
      text: portalUrl, width: 256, height: 256,
      colorDark: '#1A1A18', colorLight: '#ffffff',
    });
  } else {
    document.getElementById('idCardQr').innerHTML = `<a href="${esc(portalUrl)}" style="font-size:10px">${esc(portalUrl)}</a>`;
  }
}

window._copyIdCardLink = function() {
  const input = document.getElementById('idCardLinkInput');
  if (!input) return;
  input.select();
  navigator.clipboard?.writeText(input.value).then(
    () => showToast(t('parentLink.copied')),
    () => { document.execCommand('copy'); showToast(t('parentLink.copied')); }
  );
};

window._confirmRegenerateQr = function(studentId) {
  showConfirm(
    t('idCard.regenTitle'),
    t('idCard.regenBody'),
    t('idCard.regenConfirm'),
    async () => {
      try {
        const res = await API.regenerateStudentQr(studentId);
        showToast(t('idCard.regenDone'));
        _renderIdCardBody(res.student);
      } catch (e) {
        showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
      }
    }
  );
};

/* ─── Quick per-student Library / Transport panels ──────────────────────── */

window.showStudentLibrary = async function(studentId) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('stuLib.title')}</h3>
      <div id="stuLibBody">${skeletonCards(1)}</div>
    </div>
  `);
  const el = document.getElementById('stuLibBody');
  try {
    const rows = await API.getStudentCheckouts(studentId);
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state">${t('stuLib.empty')}</div>`;
      return;
    }
    el.innerHTML = rows.map(c => `
      <div class="row-with-delete">
        <span>${esc(c.title)} <span class="muted-note">${esc(t('stuLib.since', { date: fmtDate(c.checked_out_date) }))}</span></span>
        ${c.returned_date
          ? `<span class="muted-note">${esc(t('stuLib.returnedOn', { date: fmtDate(c.returned_date) }))}</span>`
          : `<button class="btn-pill-action ghost" onclick="_returnBookFromStudent(${c.id}, '${esc(studentId)}')">${t('stuLib.return')}</button>`}
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
  }
};

window._returnBookFromStudent = async function(checkoutId, studentId) {
  try {
    await API.returnBook(checkoutId);
    showToast(t('stuLib.returned'));
    if (typeof _libraryLoadedOnce !== 'undefined') _libraryLoadedOnce = false; // force a fresh fetch next Library visit
    showStudentLibrary(studentId);
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.error')));
  }
};

window.showStudentTransport = async function(studentId) {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('stuTr.title')}</h3>
      <div id="stuTransportBody">${skeletonCards(1)}</div>
    </div>
  `);
  const el = document.getElementById('stuTransportBody');
  try {
    const res = await API.getStudentTransport(studentId);
    const a = res.assignment;
    if (!a || !a.route_id) {
      el.innerHTML = `
        <div class="empty-state">${t('stuTr.none')}</div>
        <button class="btn-secondary mt16" onclick="closeModal();goToPage('transport')">${t('stuTr.goto')}</button>`;
      return;
    }
    el.innerHTML = `
      <div class="billing-detail-items">
        <div class="billing-detail-row"><span>${t('stuTr.route')}</span><span>${esc(a.route_name || '—')}</span></div>
        <div class="billing-detail-row"><span>${t('stuTr.driver')}</span><span>${esc(a.driver_name || '—')}</span></div>
        <div class="billing-detail-row"><span>${t('stuTr.phone')}</span><span>${esc(a.driver_phone || '—')}</span></div>
        <div class="billing-detail-row"><span>${t('stuTr.pickupStop')}</span><span>${esc(a.pickup_stop || '—')}</span></div>
        <div class="billing-detail-row"><span>${t('stuTr.pickupTime')}</span><span>${esc(a.pickup_time ? a.pickup_time.slice(0,5) : '—')}</span></div>
        <div class="billing-detail-row"><span>${t('stuTr.dropoffTime')}</span><span>${esc(a.dropoff_time ? a.dropoff_time.slice(0,5) : '—')}</span></div>
      </div>
      <button class="btn-secondary mt16" onclick="closeModal();goToPage('transport')">${t('stuTr.manage')}</button>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state">${esc(t('common.loadFailed', { err: e.message || t('common.error') }))}</div>`;
  }
};

// ─── Add student modal (with new fields) ──────────────────────────────────

window.openAddStudentModal = function() {
  _openStudentForm({ mode: 'add' });
};

window.openEditStudentModal = function(studentId) {
  const s = window.APP.students.find(x => x.student_id === studentId);
  if (!s) { showToast(t('students.toast.studentNotFound')); return; }
  _openStudentForm({ mode: 'edit', student: s });
};

function _openStudentForm({ mode, student }) {
  _pendingPhotoFile = null;
  _removePhotoRequested = false;
  const isEdit  = mode === 'edit';
  const s       = student || {};
  const grades  = window.getGradeList();
  const classes = window.getClassList();
  const colors  = window.HOME_COLORS;

    const homeHex = homeColorHex(s.home_color);

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t(isEdit ? 'students.form.editTitle' : 'students.form.addTitle')}</h3>

      <div class="stu-photo-picker" onclick="document.getElementById('stuPhotoInput').click()">
        <div class="stu-photo-circle" id="stuPhotoPreview" style="background:${homeHex}">${avatarContent(s)}</div>
        <div class="stu-photo-edit-badge">📷</div>
      </div>
      <input type="file" id="stuPhotoInput" accept="image/*" style="display:none" onchange="_onStuPhotoPicked(this)">
            <button type="button" class="stu-photo-remove-link" id="stuPhotoRemoveBtn"
              onclick="_removeStuPhoto()" style="${s.photo_url ? '' : 'display:none'}">
        ${t('students.form.removePhoto')}
      </button>
      <label class="field-label">${t('students.form.localName')}</label>
      <input class="form-input" id="newStuLocal" placeholder="${esc(t('students.form.localNamePh'))}" value="${esc(s.name_local || '')}">

      <label class="field-label">${t('students.form.englishName')}</label>
      <input class="form-input" id="newStuEn" placeholder="${esc(t('students.form.englishNamePh'))}" value="${esc(s.name_en || '')}">

      <div class="form-row">
        <div class="form-col">
          <label class="field-label">${t('students.form.class')}</label>
          <button type="button" class="form-picker-trigger" id="newStuClassBtn"
                  onclick="pickClassValue('newStuClass')">
            <span class="form-picker-value" id="newStuClass_label">${s.class ? esc(s.class) : t('students.form.selectClass')}</span>
            <svg class="form-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <input type="hidden" id="newStuClass" value="${esc(s.class || '')}">
        </div>
        <div class="form-col">
          <label class="field-label">${t('students.form.grade')}</label>
          <button type="button" class="form-picker-trigger" id="newStuGradeBtn"
                  onclick="pickGradeValue('newStuGrade')">
            <span class="form-picker-value" id="newStuGrade_label">${s.grade ? esc(s.grade) : t('students.form.selectGrade')}</span>
            <svg class="form-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <input type="hidden" id="newStuGrade" value="${esc(s.grade || '')}">
        </div>
      </div>

      <label class="field-label">${t('students.form.gender')}</label>
      <div class="pill-group" id="genderPills">
        <button class="pill ${s.gender === 'M' ? 'active' : ''}" type="button" data-value="M" onclick="togglePill(this,'genderPills')">${t('students.form.genderM')}</button>
        <button class="pill ${s.gender === 'F' ? 'active' : ''}" type="button" data-value="F" onclick="togglePill(this,'genderPills')">${t('students.form.genderF')}</button>
        <button class="pill ${s.gender === 'Other' ? 'active' : ''}" type="button" data-value="Other" onclick="togglePill(this,'genderPills')">${t('students.form.genderOther')}</button>
      </div>

      <label class="field-label">${t('students.form.birthday')} <span class="optional">${t('students.form.birthdayHint')}</span></label>
      <input class="form-input" id="newStuDob" type="date" value="${esc(s.date_of_birth || '')}" max="${new Date().toISOString().slice(0,10)}">

      <label class="field-label">${t('students.form.homeColor')} <span class="optional">${t('students.form.homeColorHint')}</span></label>
      <div class="color-grid" id="colorGrid">
        ${colors.map(c => `
          <button type="button" class="color-swatch ${s.home_color === c.id ? 'active' : ''}"
            data-color="${esc(c.id)}"
            style="--swatch:${c.hex}"
            title="${esc(homeColorName(c.id))}"
            onclick="selectHomeColor('${esc(c.id)}')">
            <span class="swatch-dot"></span>
            <span class="swatch-name">${esc(homeColorName(c.id))}</span>
          </button>`).join('')}
      </div>
      <input type="hidden" id="newStuColor" value="${esc(s.home_color || '')}">

      <div class="form-divider"><span>${t('students.form.parentSection')}</span></div>

      <label class="field-label">${t('students.form.parentName')}</label>
      <input class="form-input" id="newStuParent" placeholder="${esc(t('students.form.parentNamePh'))}" value="${esc(s.parent_name || '')}">

      <label class="field-label">${t('students.form.parentPhone')}</label>
      <input class="form-input" id="newStuPhone" type="tel" placeholder="${esc(t('students.form.parentPhonePh'))}" value="${esc(s.parent_phone || '')}">

      <label class="field-label">${t('students.form.parentEmail')} <span class="optional">${t('common.optional')}</span></label>
      <input class="form-input" id="newStuEmail" type="email" placeholder="${esc(t('students.form.parentEmailPh'))}" value="${esc(s.parent_email || '')}">

      ${isEdit
        ? `<label class="field-label">${t('students.form.parentTg')}</label>
           <div class="parent-tg-row">
             ${s.parent_tg_id
                ? `<div class="tg-linked-box">${t('students.linked')} &nbsp;<code>${esc(s.parent_tg_id)}</code></div>`
                : `<button type="button" class="link-btn" onclick="showParentLinkQR('${esc(s.student_id)}')">${t('students.sendLinkBtn')}</button>`}
           </div>`
        : `<div class="info-tip">
             <span class="info-tip-icon">ℹ️</span>
             <span>${t('students.form.parentTgInfo')}</span>
           </div>`
      }

      <button class="btn-primary mt16" id="saveStudentBtn" onclick="saveStudentForm('${isEdit ? 'edit' : 'add'}','${isEdit ? esc(s.student_id) : ''}')">
        ${t(isEdit ? 'students.form.saveEdit' : 'students.form.register')}
      </button>
      ${isEdit ? `
        <button class="btn-danger" onclick="confirmDeleteStudent('${esc(s.student_id)}')">
          ${t('students.form.removeBtn')}
        </button>` : ''}
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>`;

  openModal(html);
}

window.selectHomeColor = function(colorId) {
  document.querySelectorAll('#colorGrid .color-swatch').forEach(b => {
    b.classList.toggle('active', b.dataset.color === colorId);
  });
  const hidden = document.getElementById('newStuColor');
  if (hidden) hidden.value = colorId;
};
window._onStuPhotoPicked = function(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast(t('students.toast.imageOnly')); return; }
  if (file.size > 20 * 1024 * 1024) { showToast(t('students.toast.imageTooBig')); return; }

  _pendingPhotoFile = file;
  _removePhotoRequested = false;
  const reader = new FileReader();
  reader.onload = () => {
    const preview = document.getElementById('stuPhotoPreview');
    if (preview) preview.innerHTML = `<img src="${reader.result}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">`;
  };
      const removeBtn = document.getElementById('stuPhotoRemoveBtn');
    if (removeBtn) removeBtn.style.display = '';
  reader.readAsDataURL(file);
};

window._removeStuPhoto = function() {
  _pendingPhotoFile = null;
  _removePhotoRequested = true;
  const preview = document.getElementById('stuPhotoPreview');
  if (preview) {
    const genderGuess = document.querySelector('#genderPills .pill.active')?.dataset.value || '';
    preview.innerHTML = avatarContent({ gender: genderGuess, name_en: document.getElementById('newStuEn')?.value });
  }
  const removeBtn = document.getElementById('stuPhotoRemoveBtn');
  if (removeBtn) removeBtn.style.display = 'none';
  document.getElementById('stuPhotoInput').value = '';
};
window.saveStudentForm = async function(mode, studentId) {
  const btn = document.getElementById('saveStudentBtn');

  const data = {
    name_local:   document.getElementById('newStuLocal').value.trim(),
    name_en:      document.getElementById('newStuEn').value.trim(),
    class:        document.getElementById('newStuClass').value.trim(),
    grade:        document.getElementById('newStuGrade').value,
    gender:       document.querySelector('#genderPills .pill.active')?.dataset.value || '',
    date_of_birth: document.getElementById('newStuDob').value || null,
    home_color:   document.getElementById('newStuColor').value || null,
    parent_name:  document.getElementById('newStuParent').value.trim(),
    parent_phone: document.getElementById('newStuPhone').value.trim(),
    parent_email: document.getElementById('newStuEmail').value.trim(),
  };
  // name_mm kept as a copy of name_local for backward compatibility with the original schema
  data.name_mm = data.name_local || data.name_en;

  // Validation
  if (!data.name_en)  { showToast(t('students.toast.nameRequired')); return; }
  if (!data.class)    { showToast(t('students.toast.classRequired')); return; }
  if (data.parent_email && !isValidEmail(data.parent_email)) {
    showToast(t('students.toast.emailInvalid')); return;
  }
  if (data.parent_phone && !isValidPhone(data.parent_phone)) {
    showToast(t('students.toast.phoneInvalid')); return;
  }

  btn.disabled = true;
  btn.textContent = t(mode === 'edit' ? 'students.form.savingEdit' : 'students.form.registering');

      try {
    if (mode === 'edit') {
      await API.updateStudent(studentId, data);
      // Update local cache
      const idx = window.APP.students.findIndex(x => x.student_id === studentId);
      if (idx >= 0) {
        window.APP.students[idx] = { ...window.APP.students[idx], ...data };
      }
            if (_pendingPhotoFile) {
        try {
          const url = await API.uploadStudentPhoto(studentId, _pendingPhotoFile);
          await API.setStudentPhoto(studentId, url);
          if (idx >= 0) window.APP.students[idx].photo_url = url;
        } catch (photoErr) {
          showToast(t('students.toast.photoUploadFailedEdit', { err: photoErr.message || t('common.error') }));
        }
        _pendingPhotoFile = null;
      } else if (_removePhotoRequested) {
        try {
          await API.setStudentPhoto(studentId, null);
          if (idx >= 0) window.APP.students[idx].photo_url = null;
        } catch (photoErr) {
          showToast(t('students.toast.photoRemoveFailed', { err: photoErr.message || t('common.error') }));
        }
        _removePhotoRequested = false;
      }
      closeModal();
      renderStudents();
      showToast(t('students.toast.updated', { name: data.name_en }));
      if (window.APP.tg?.HapticFeedback) window.APP.tg.HapticFeedback.notificationOccurred('success');
    } else {
      const result = await API.registerStudent({
        ...data,
        school_id:    window.APP.school_id,
        teacher_id:   window.APP.teacher_id,
      });

      const newStudent = result?.student || result?.data || {
        student_id: result?.student_id || `STU-${Date.now()}`,
        ...data,
        status: 'Active',
        school_id: window.APP.school_id,
      };

      if (_pendingPhotoFile && newStudent.student_id) {
        try {
          const url = await API.uploadStudentPhoto(newStudent.student_id, _pendingPhotoFile);
          await API.setStudentPhoto(newStudent.student_id, url);
          newStudent.photo_url = url;
        } catch (photoErr) {
          showToast(t('students.toast.photoUploadFailedAdd', { err: photoErr.message || t('common.error') }));
        }
        _pendingPhotoFile = null;
      }

      window.APP.students.push(newStudent);

      // After registering, immediately show the parent-link QR / share screen
      _showParentLinkAfterRegister(newStudent);

      renderStudents();
      showToast(t('students.toast.registered', { name: data.name_en }));
      if (window.APP.tg?.HapticFeedback) window.APP.tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = t(mode === 'edit' ? 'students.form.saveEdit' : 'students.form.register');
    showToast(t(mode === 'edit' ? 'students.toast.saveFailed' : 'students.toast.registerFailed', { err: e.message || t('common.networkError') }));
  }
};

window.confirmDeleteStudent = function(studentId) {
  const s = window.APP.students.find(x => x.student_id === studentId);
  if (!s) return;

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${esc(t('students.delete.title', { name: s.name_en }))}</h3>
      <p style="color:var(--muted); font-size:14px; line-height:1.6">
        ${t('students.delete.body')}
      </p>
      <button class="btn-danger mt16" onclick="doDeleteStudent('${esc(studentId)}')">${t('students.delete.confirm')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>`;
  openModal(html);
};

window.doDeleteStudent = async function(studentId) {
  try {
    await API.deleteStudent(studentId);
    const idx = window.APP.students.findIndex(x => x.student_id === studentId);
    if (idx >= 0) window.APP.students[idx].status = 'Inactive';
    closeModal();
    renderStudents();
    showToast(t('students.delete.done'));
  } catch (e) {
    showToast(t('common.failed') + ' ' + (e.message || t('common.networkError')));
  }
};

// ─── Parent linking via deep-link ─────────────────────────────────────────

/** After registering, show the share-link screen so the teacher can forward
 *  the deep-link to the parent (via Telegram, SMS, WhatsApp, etc.). */
function _showParentLinkAfterRegister(student) {
  const url = buildParentLinkURL(student.student_id);
  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('parentLink.title')}</h3>
      <p style="color:var(--muted); font-size:14px; line-height:1.6; margin-bottom:16px;">
        ${t('parentLink.body', { name: '<b>' + esc(student.name_en) + '</b>' })}
      </p>

      <div class="link-box">
        <code id="parentLinkUrl">${esc(url)}</code>
      </div>

      <div class="link-actions">
        <button class="btn-primary" onclick="copyParentLink('${esc(url)}')">${t('parentLink.copy')}</button>
        ${isTWA() ? `<button class="btn-secondary" onclick="shareParentLinkInTelegram('${esc(url)}','${esc(student.name_en)}')">${t('parentLink.share')}</button>` : ''}
      </div>

      <div class="link-status" id="linkStatus">
        <div class="link-status-dot"></div>
        <span id="linkStatusText">${t('parentLink.waiting')}</span>
      </div>

      <button class="btn-secondary mt16" onclick="dismissParentLink()">${t('parentLink.done')}</button>
    </div>`;

  openModal(html, () => {
    if (_parentLinkPollTimer) { clearInterval(_parentLinkPollTimer); _parentLinkPollTimer = null; }
  });

  // Poll the server every 5s to see if the parent has linked
  _parentLinkPollTimer = setInterval(async () => {
    try {
      const result = await API.checkParentLink(student.student_id);
      if (result?.parent_tg_id) {
        // Linked! Update student in cache
        const idx = window.APP.students.findIndex(x => x.student_id === student.student_id);
        if (idx >= 0) {
          window.APP.students[idx].parent_tg_id = result.parent_tg_id;
          if (result.parent_name && !window.APP.students[idx].parent_name) {
            window.APP.students[idx].parent_name = result.parent_name;
          }
        }
        const statusEl = document.getElementById('linkStatusText');
        if (statusEl) {
          statusEl.innerHTML = t('parentLink.linkedHtml', { id: esc(result.parent_tg_id) });
          document.getElementById('linkStatus').classList.add('linked');
        }
        clearInterval(_parentLinkPollTimer);
        _parentLinkPollTimer = null;
        renderStudents();
      }
    } catch (_e) { /* keep polling silently */ }
  }, 5000);
}

window.dismissParentLink = function() {
  if (_parentLinkPollTimer) { clearInterval(_parentLinkPollTimer); _parentLinkPollTimer = null; }
  closeModal();
};

window.copyParentLink = function(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => showToast(t('parentLink.copied')),
      () => _fallbackCopy(url)
    );
  } else {
    _fallbackCopy(url);
  }
};

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast(t('parentLink.copied')); }
  catch { showToast(t('parentLink.copyFail')); }
  document.body.removeChild(ta);
}

window.shareParentLinkInTelegram = function(url, studentName) {
  const text = t('parentLink.shareText', { name: studentName });
  if (window.APP.tg?.openTelegramLink) {
    // Use TG's native share — opens forward dialog
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    window.APP.tg.openTelegramLink(shareUrl);
  } else {
    copyParentLink(url);
  }
};

/** Show the parent-link sheet on demand (from detail view's "Get link" button) */
window.showParentLinkQR = function(studentId) {
  const s = window.APP.students.find(x => x.student_id === studentId);
  if (!s) return;
  closeModal();
  setTimeout(() => _showParentLinkAfterRegister(s), 250);
};

/* ─── Class / Grade value pickers (bottom sheet) ────────────────────── */

window.pickClassValue = function(targetInputId) {
  _openValuePicker({
    title:   t('picker.class.title'),
    items:   window.getClassList(),
    current: document.getElementById(targetInputId)?.value || '',
    onPick:  (v) => _setValueAndLabel(targetInputId, v),
    addLabel: t('picker.class.addLabel'),
    onAdd:    (newVal) => {
      _setValueAndLabel(targetInputId, newVal);
      _persistConfigList('classes', newVal);
    },
    allowEditList: true,
    listKey: 'classes',
  });
};

window.pickGradeValue = function(targetInputId) {
  _openValuePicker({
    title:   t('picker.grade.title'),
    items:   window.getGradeList(),
    current: document.getElementById(targetInputId)?.value || '',
    onPick:  (v) => _setValueAndLabel(targetInputId, v),
    addLabel: t('picker.grade.addLabel'),
    onAdd:    (newVal) => {
      _setValueAndLabel(targetInputId, newVal);
      _persistConfigList('grades', newVal);
    },
    allowEditList: true,
    listKey: 'grades',
  });
};

function _setValueAndLabel(targetInputId, v) {
  const input = document.getElementById(targetInputId);
  const label = document.getElementById(targetInputId + '_label');
  if (input) input.value = v;
  if (label) label.textContent = v || t('picker.select');
  closeModal();
}

function _openValuePicker({ title, items, current, onPick, addLabel, onAdd, allowEditList, listKey }) {
  const itemsHtml = items.length
    ? items.map(v => `
        <button type="button" class="vp-row ${v === current ? 'sel' : ''}" onclick="_vpPick('${esc(v)}')">
          <span class="vp-label">${esc(v)}</span>
          ${v === current ? '<span class="vp-check">✓</span>' : ''}
          ${allowEditList && window.APP.is_admin ? `<button class="vp-delete" onclick="event.stopPropagation(); _vpDeleteFromList('${esc(listKey)}','${esc(v)}')" aria-label="${esc(t('picker.remove'))}" title="${esc(t('picker.removeFromList'))}">×</button>` : ''}
        </button>`).join('')
    : `<div class="vp-empty">${t('picker.empty')}</div>`;

  openModal(`
    <div class="modal-sheet vp-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${esc(title)}</h3>
      <div class="vp-list">${itemsHtml}</div>
      ${addLabel ? `
        <div class="vp-add-row">
          <input type="text" class="form-input" id="vpAddInput" placeholder="${esc(addLabel)} ${esc(t('picker.class.placeholder'))}" maxlength="20">
          <button class="btn-primary" onclick="_vpAddItem()">${t('common.add')}</button>
        </div>` : ''}
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
  window._vpPick = onPick;
  window._vpOnAdd = onAdd;
}

window._vpAddItem = function() {
  const input = document.getElementById('vpAddInput');
  const v = (input?.value || '').trim();
  if (!v) { showToast(t('picker.typeName')); return; }
  if (typeof window._vpOnAdd === 'function') window._vpOnAdd(v);
};

window._vpDeleteFromList = async function(listKey, value) {
  if (!confirm(t('picker.deleteConfirm', { value, list: t('picker.list.' + listKey) }) + '\n\n' + t('picker.deleteNote', { kind: t('picker.kind.' + listKey) }))) return;
  const cfg = window.APP.config || {};
  const cur = Array.isArray(cfg[listKey]) ? cfg[listKey] : window[listKey === 'classes' ? 'getClassList' : 'getGradeList']();
  const updated = cur.filter(x => x !== value);
  cfg[listKey] = updated;
  showToast(t('common.saving'));
  try {
    await API.updateSchoolConfig({ [listKey]: updated });
    showToast(t('common.removed'));
    closeModal();
  } catch (e) {
    showToast(t('common.saveFailed'));
  }
};

async function _persistConfigList(listKey, newValue) {
  const cfg = window.APP.config || {};
  const cur = Array.isArray(cfg[listKey]) ? cfg[listKey].slice() : window[listKey === 'classes' ? 'getClassList' : 'getGradeList']();
  if (cur.includes(newValue)) return;          // already there
  cur.push(newValue);
  cfg[listKey] = cur;
  try {
    await API.updateSchoolConfig({ [listKey]: cur });
  } catch (e) {
    console.warn('[config] save failed', e);
  }
}
