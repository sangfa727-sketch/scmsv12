/**
 * SCMS v11 — 03b_student_picker.js
 * Smart, reusable student picker used across daily reports, incidents, comms, etc.
 *
 * Usage:
 *   openStudentPicker({
 *     title:    'Choose a student',
 *     subtitle: 'For daily report',
 *     classFilter: 'P3',       // optional — pre-filter to one class
 *     onPick:   (student) => { ... },
 *   });
 *
 * Behaviour:
 *   • Bottom-sheet modal with a big search input at the top
 *   • Class chips below the search bar so the teacher can narrow with a tap
 *   • Big tappable rows with avatar + name + class — much friendlier than
 *     the old "type the name into a datalist" pattern
 *   • Live-filters as the teacher types (matches name, local name, ID, class)
 */

'use strict';

let _pickerState = {
  search:      '',
  classFilter: 'All',
  onPick:      null,
};

window.openStudentPicker = function(opts = {}) {
  _pickerState = {
    search:      '',
    classFilter: opts.classFilter || 'All',
    onPick:      opts.onPick || (() => {}),
  };

  const classes = ['All', ...[...new Set(
    window.APP.students.filter(s => s.status === 'Active').map(s => s.class).filter(Boolean)
  )].sort()];

  const html = `
    <div class="modal-sheet picker-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <div class="picker-header">
        <h3 class="modal-title mb0">${esc(opts.title || 'Choose a student')}</h3>
        ${opts.subtitle ? `<div class="picker-subtitle">${esc(opts.subtitle)}</div>` : ''}
      </div>

      <div class="picker-search">
        <span class="search-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <input type="text" id="pickerSearchInput" placeholder="${esc(t('picker.searchPh'))}" autocomplete="off">
        <button class="clear-btn" id="pickerClearBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="chips-row picker-chips" id="pickerClassChips">
        ${classes.map(c => `<button class="chip${c === _pickerState.classFilter ? ' active' : ''}" data-class="${esc(c)}" onclick="filterPickerClass('${esc(c)}')">${esc(c === 'All' ? t('common.all') : c)}</button>`).join('')}
      </div>

      <div class="picker-list" id="pickerList"></div>

      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.cancel')}</button>
    </div>`;

  openModal(html);

  setTimeout(() => {
    const input = document.getElementById('pickerSearchInput');
    const clear = document.getElementById('pickerClearBtn');
    if (input) {
      input.focus();
      input.addEventListener('input', () => {
        _pickerState.search = input.value.trim().toLowerCase();
        clear.style.display = _pickerState.search ? 'flex' : 'none';
        _renderPickerList();
      });
      clear.addEventListener('click', () => {
        input.value = '';
        _pickerState.search = '';
        clear.style.display = 'none';
        _renderPickerList();
        input.focus();
      });
    }
    _renderPickerList();
  }, 60);
};

window.filterPickerClass = function(cls) {
  _pickerState.classFilter = cls;
  document.querySelectorAll('#pickerClassChips .chip').forEach(b =>
    b.classList.toggle('active', b.dataset.class === cls)
  );
  _renderPickerList();
};

function _renderPickerList() {
  const el = document.getElementById('pickerList');
  if (!el) return;

  let list = window.APP.students.filter(s => s.status === 'Active');

  if (_pickerState.classFilter !== 'All') {
    list = list.filter(s => s.class === _pickerState.classFilter);
  }
  if (_pickerState.search) {
    const q = _pickerState.search;
    list = list.filter(s =>
      (s.name_en    || '').toLowerCase().includes(q) ||
      (s.name_local || '').toLowerCase().includes(q) ||
      (s.student_id || '').toLowerCase().includes(q) ||
      (s.class      || '').toLowerCase().includes(q)
    );
  }

  // Group by class for a cleaner visual structure
  const grouped = groupBy(list, 'class');
  const classKeys = Object.keys(grouped).sort();

  if (!list.length) {
    el.innerHTML = `<div class="picker-empty">No students match "${esc(_pickerState.search)}"</div>`;
    return;
  }

  el.innerHTML = classKeys.map(cls => {
    const groupStudents = grouped[cls].sort((a,b) => (a.name_en||'').localeCompare(b.name_en||''));
    return `
      <div class="picker-group">
        <div class="picker-group-title">${esc(cls)} <span class="picker-group-count">${groupStudents.length}</span></div>
        ${groupStudents.map(s => {
          const homeHex = s.home_color ? homeColorHex(s.home_color) : _pickerClassColor(s.class);
          return `
            <button class="picker-row" onclick="pickStudent('${esc(s.student_id)}')">
              <span class="picker-avatar" style="background:${homeHex}">${avatarContent(s)}</span>
              <span class="picker-row-info">
                <span class="picker-row-name">${esc(s.name_en || s.name_local)}</span>
                ${s.name_local && s.name_local !== s.name_en
                  ? `<span class="picker-row-sub">${esc(s.name_local)}</span>`
                  : `<span class="picker-row-sub">${esc(s.student_id)}</span>`}
              </span>
              <svg class="picker-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>`;
        }).join('')}
      </div>`;
  }).join('');
}

window.pickStudent = function(studentId) {
  const s = window.APP.students.find(x => x.student_id === studentId);
  if (!s) return;
  const cb = _pickerState.onPick;
  closeModal();
  setTimeout(() => cb(s), 220);   // give modal time to close
};

function _pickerClassColor(cls) {
  const colors = ['#4F46E5','#0891B2','#059669','#D97706','#DC2626','#7C3AED','#DB2777'];
  if (!cls) return colors[0];
  return colors[cls.charCodeAt(0) % colors.length];
}
