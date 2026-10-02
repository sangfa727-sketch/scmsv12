/**
 * SCMS v11 — 12_more.js
 * More menu: quick actions, admin tools, school info, chat (native only),
 * school logo display and upload (admin only).
 */

'use strict';

function refreshMoreThemeControl() {
  const current = window.SCMSTheme?.current?.() || 'light';
  const label = document.getElementById('moreThemeCurrent');
  if (label) label.textContent = current === 'dark' ? t('settings.themeDark') : t('settings.themeLight');
  document.querySelectorAll('.more-theme-option').forEach(btn => {
    const selected = btn.dataset.themeChoice === current;
    btn.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}
window.refreshMoreThemeControl = refreshMoreThemeControl;

function renderMore() {
  const el = document.getElementById('moreMenu');
  if (!el) return;

  const isAdmin = window.APP.is_admin;
  const showChat = !isTWA();   // chat is hidden inside Telegram
  const schoolLogo = window.APP.school_logo || (window.APP.config && window.APP.config.school_logo) || '';
  const schoolName = window.APP.school_name || '—';

  // School header card with logo (or placeholder)
  const logoBlock = schoolLogo
    ? `<img src="${esc(schoolLogo)}" alt="${esc(t('more.logoAlt'))}" class="school-logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="school-logo-fallback" style="display:none">${esc(schoolName[0] || 'S')}</div>`
    : `<div class="school-logo-fallback">${esc(schoolName[0] || 'S')}</div>`;

  el.innerHTML = `
    <div class="school-header-card">
      <div class="school-logo-wrap">
        ${logoBlock}
        ${isAdmin ? `
        <button class="school-logo-edit" onclick="openSchoolLogoModal()" title="${esc(t('more.changeLogo'))}" aria-label="${esc(t('sb.changeLogo'))}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>` : ''}
      </div>
      <div class="school-header-info">
        <div class="school-header-name">${esc(schoolName)}</div>
        <div class="school-header-meta">${esc(window.APP.currentTerm?.term_name || t('more.currentTerm'))}</div>
      </div>
    </div>

    <div class="profile-card">
      <div class="profile-avatar profile-avatar-btn" onclick="openMyPhotoModal()" title="${esc(t('more.changePhoto'))}" role="button" aria-label="${esc(t('more.changePhotoAria'))}">
        ${window.APP.teacher_photo_url
          ? `<img src="${esc(window.APP.teacher_photo_url)}" alt="" class="avatar-img">`
          : esc((window.APP.teacher_name || '?')[0])}
        <span class="avatar-cam">📷</span>
      </div>
      <div class="profile-info">
        <div class="profile-name">${esc(window.APP.teacher_name || '—')}</div>
        <div class="profile-role">${esc(window.APP.teacher_role || '—')}</div>
        <div class="profile-id">${esc(window.APP.teacher_id || '—')}</div>
      </div>
    </div>

    <div class="more-section-title">${t('more.browse')}</div>
    <div class="more-grid">
      <button class="more-tile more-tile-help" onclick="openHelpModal()">
        <span class="more-icon">📖</span>
        <span>${t('more.help')}</span>
      </button>
      <button class="more-tile more-tile-modules" onclick="openModulesMenu()">
        <span class="more-icon">🗂️</span>
        <span>${t('more.modules')}</span>
      </button>
      ${showChat ? `
      <button class="more-tile" onclick="goToPage('chat')">
        <span class="more-icon">🗨️</span>
        <span>${t('more.staffChat')}</span>
      </button>` : ''}
    </div>

    ${isAdmin ? `
    <div class="more-section-title">${t('more.admin')}</div>
    <div class="more-list">
      <button class="more-row more-row-management" onclick="openManagementCenter()">
        <span class="more-row-icon">🛠️</span>
        <span class="more-row-label">${t('more.admin')}</span>
        <span class="more-row-chevron">›</span>
      </button>
      <button class="more-row" onclick="openSchoolLogoModal()">
        <span class="more-row-icon">🖼️</span>
        <span class="more-row-label">${t('more.logo')}</span>
        <span class="more-row-chevron">›</span>
      </button>
      <button class="more-row" onclick="openSchoolCoverModal()">
        <span class="more-row-icon">🌄</span>
        <span class="more-row-label">${t('more.cover')}</span>
        <span class="more-row-chevron">›</span>
      </button>
      <button class="more-row" onclick="openManageClassesModal()">
        <span class="more-row-icon">🏷️</span>
        <span class="more-row-label">${t('more.classes')}</span>
        <span class="more-row-chevron">›</span>
      </button>
      <button class="more-row" onclick="showAdminInfo()">
        <span class="more-row-icon">🏫</span>
        <span class="more-row-label">${t('more.schoolSettings')}</span>
        <span class="more-row-chevron">›</span>
      </button>
      <button class="more-row" onclick="openTeacherManager()">
        <span class="more-row-icon">👥</span>
        <span class="more-row-label">${t('more.teachers')}</span>
        <span class="more-row-chevron">›</span>
      </button>
      <button class="more-row" onclick="showToast(t('more.exportSoon'))">
        <span class="more-row-icon">📤</span>
        <span class="more-row-label">${t('more.export')}</span>
        <span class="more-row-chevron">›</span>
      </button>
    </div>` : ''}

    <div class="more-section-title">${t('more.display')}</div>
    <div class="more-theme-card" role="group" aria-label="${t('settings.theme')}">
      <div class="more-theme-copy">
        <strong>${t('settings.theme')}</strong>
        <span id="moreThemeCurrent"></span>
      </div>
      <div class="more-theme-toggle" role="radiogroup" aria-label="${t('settings.theme')}">
        <button type="button" class="more-theme-option" data-theme-choice="light" role="radio" onclick="SCMSTheme.set('light'); refreshMoreThemeControl()">${t('settings.themeLight')}</button>
        <button type="button" class="more-theme-option" data-theme-choice="dark" role="radio" onclick="SCMSTheme.set('dark'); refreshMoreThemeControl()">${t('settings.themeDark')}</button>
      </div>
    </div>
    <div class="more-info-card">
      <label class="pref-row">
        <span class="pref-text">
          <span class="pref-title">${t('more.bottomBar')}</span>
          <span class="pref-sub">${t('more.bottomBarSub')}</span>
        </span>
        <input type="checkbox" class="pref-switch" ${_desktopTabBarOn() ? 'checked' : ''}
          onchange="toggleDesktopTabBar(this.checked)">
      </label>
    </div>

    <div class="more-section-title">${t('more.about')}</div>
    <div class="more-info-card">
      <div class="info-row"><span>${t('more.schoolId')}</span><code>${esc(window.APP.school_id || '—')}</code></div>
      <div class="info-row"><span>${t('more.activeStudents')}</span><span>${window.APP.students.filter(s=>s.status==='Active').length}</span></div>
      <div class="info-row"><span>${t('more.platform')}</span><span>${esc(window.APP.platform)}</span></div>
      <div class="info-row"><span>${t('more.version')}</span><span>v${esc(SCMS_CONFIG.VERSION)}</span></div>
    </div>

    ${!isTWA() ? `
    <button class="btn-danger" style="margin-top:18px" onclick="confirmSignOut()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      ${t('sb.signout')}
    </button>` : ''}

    <div style="height: 40px;"></div>
  `;
  refreshMoreThemeControl();
}

/* All feature modules live under one "School Modules" tile (Browse section). */
const MODULE_ITEMS = [
  { id: 'incidents',  icon: '⚡'  },
  { id: 'grades',     icon: '🎓' },
  { id: 'billing',    icon: '💵' },
  { id: 'admissions', icon: '📝' },
  { id: 'library',    icon: '📚' },
  { id: 'transport',  icon: '🚌' },
  { id: 'parents',    icon: '📨' },
  { id: 'timetable',  icon: '🗓️' },
  { id: 'summary',    icon: '📊' },
];
// label follows the current language
MODULE_ITEMS.forEach(m => Object.defineProperty(m, 'label', { get: () => t('module.' + m.id) }));

/** Module ids shown in the sidebar (default: all until the user saves a choice). */
window.getSidebarModuleIds = function () {
  const saved = window.APP.ui_prefs && window.APP.ui_prefs.sidebar_modules;
  const ids = Array.isArray(saved) ? saved : MODULE_ITEMS.map(m => m.id);
  return ids.filter(id => id !== 'admissions' || !!window.APP?.is_admin);
};

let _modulesDraft = null;   // Set of ids ticked in the open sheet (not saved yet)

window.openModulesMenu = function () {
  _modulesDraft = new Set(getSidebarModuleIds());
  const visibleModuleItems = MODULE_ITEMS.filter(m => m.id !== 'admissions' || !!window.APP?.is_admin);
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('modules.title')}</h3>
      <p class="modal-subtitle">${t('modules.hint')}</p>
      <div class="more-grid" style="padding:8px 0 4px">
        ${visibleModuleItems.map(m => `
        <div class="more-tile module-card" role="button" tabindex="0" onclick="modulesGo('${m.id}')">
          <label class="module-check" onclick="event.stopPropagation()" title="${esc(t('modules.showInSidebar'))}">
            <input type="checkbox" ${_modulesDraft.has(m.id) ? 'checked' : ''}
              onchange="_modulesToggle('${m.id}', this.checked)">
            <span class="module-check-box"></span>
          </label>
          <span class="more-icon">${m.icon}</span>
          <span>${esc(m.label)}</span>
        </div>`).join('')}
      </div>
      <div class="modal-footer">
<button class="btn-primary" style="margin-top:14px" id="btnSaveModules" onclick="saveSidebarModules()">${t('modules.save')}</button>
    </div>`);
};

window._modulesToggle = function (id, on) {
  if (!_modulesDraft) return;
  if (on) _modulesDraft.add(id); else _modulesDraft.delete(id);
};

window.saveSidebarModules = async function () {
  if (window.APP.platform !== 'web') { showToast(t('modules.needWeb')); return; }
  const btn = document.getElementById('btnSaveModules');
  if (btn) { btn.disabled = true; btn.textContent = t('common.saving'); }
  try {
    const ids = MODULE_ITEMS.map(m => m.id).filter(id => _modulesDraft.has(id));  // keep canonical order
    const res = await API.setMyUiPrefs({ sidebar_modules: ids });
    window.APP.ui_prefs = (res && res.ui_prefs) || { ...(window.APP.ui_prefs || {}), sidebar_modules: ids };
    try { renderSidebar(); } catch (e) {}
    showToast(t('modules.saved'));
    closeModal();
  } catch (err) {
    console.error('[modules] save failed', err);
    showToast(t('modules.saveFailed', { err: err.message || t('common.saveFailed') }));
    if (btn) { btn.disabled = false; btn.textContent = t('modules.save'); }
  }
};

window.modulesGo = function (pageId) {
  if (pageId === 'admissions' && !window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }
  closeModal();
  setTimeout(() => goToPage(pageId), 150);
};

/* ─── Management Center (admin) ────────────────────────────────── */
window.openManagementCenter = function () {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const items = [
    ['👥', 'more.teachers', () => openTeacherManager()],
    ['🏷️', 'more.classes', () => openManageClassesModal()],
    ['🏫', 'more.schoolSettings', () => showAdminInfo()],
    ['🖼️', 'more.logo', () => openSchoolLogoModal()],
    ['🌄', 'more.cover', () => openSchoolCoverModal()],
    ['🗂️', 'more.modules', () => openModulesMenu()],
    ['⚙️', 'settings.title', () => openSettings()]
  ];
  const html = [
    '<div class="modal-sheet management-center-sheet" onclick="event.stopPropagation()">',
    '<div class="modal-handle"></div>',
    '<h3 class="modal-title">🛠️ ' + esc(t('more.admin')) + '</h3>',
    '<p class="modal-subtitle">' + esc(t('schoolInfo.hint')) + '</p>',
    '<div class="more-grid management-center-grid">',
    items.map((item, index) => '<button type="button" class="more-tile" data-management-action="' + index + '"><span class="more-icon">' + item[0] + '</span><span>' + esc(t(item[1])) + '</span></button>').join(''),
    '</div>',
    '<button type="button" class="btn-secondary mt16" onclick="closeModal()">' + esc(t('common.close')) + '</button>',
    '</div>'
  ].join('');
  openModal(html);
  document.querySelectorAll('[data-management-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items[Number(button.dataset.managementAction)];
      if (!item) return;
      closeModal();
      setTimeout(item[2], 190);
    });
  });
};

/* Desktop bottom tab bar: on by default, can be switched off (device-local). */
const _TABBAR_KEY = 'scms_desktop_tabbar';
function _desktopTabBarOn() {
  try { return localStorage.getItem(_TABBAR_KEY) !== 'off'; } catch (e) { return true; }
}
function _applyDesktopTabBar() {
  document.documentElement.classList.toggle('tabbar-off', !_desktopTabBarOn());
}
window.toggleDesktopTabBar = function (on) {
  try { localStorage.setItem(_TABBAR_KEY, on ? 'on' : 'off'); } catch (e) {}
  _applyDesktopTabBar();
  showToast(t(on ? 'more.bottomBarOn' : 'more.bottomBarOff'));
};
_applyDesktopTabBar();

window.confirmSignOut = function () {
  const wrap = document.createElement('div');
  wrap.id = 'signOutConfirmModal';
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:360px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('signout.title')}</h3>
      <p class="modal-subtitle">${t('signout.body')}</p>

      <div class="modal-footer modal-footer-destructive">
<button class="btn-danger solid student-destructive-action" onclick="_doSignOutConfirmed()">${t('sb.signout')}</button>
<div class="modal-footer-main">
<button class="btn-secondary" type="button" onclick="_closeSignOutConfirm()">${t('common.cancel')}</button>
</div>
</div>
</div>
    </div>`;
  wrap.onclick = _closeSignOutConfirm;
  document.body.appendChild(wrap);
  wrap.classList.add('active');
};

window._closeSignOutConfirm = function () {
  document.getElementById('signOutConfirmModal')?.remove();
};

window._doSignOutConfirmed = function () {
  _closeSignOutConfirm();
  if (typeof signOut === 'function') signOut();
};

/* School logo / cover / profile-photo modals now live in 26_branding.js */

/**
 * Insert/update the small logo in the header (next to school name).
 * Called after bootstrap and after a logo change.
 */
function _applyLogoToHeader() {
  const url = window.APP.school_logo || (window.APP.config && window.APP.config.school_logo) || '';
  const schoolInfoEl = document.querySelector('.school-info');
  if (!schoolInfoEl) return;
  let logoEl = document.getElementById('headerLogo');
  if (url) {
    if (!logoEl) {
      logoEl = document.createElement('img');
      logoEl.id = 'headerLogo';
      logoEl.className = 'header-logo';
      logoEl.alt = '';
      schoolInfoEl.parentNode.insertBefore(logoEl, schoolInfoEl);
    }
    logoEl.src = url;
    logoEl.style.display = 'block';
  } else if (logoEl) {
    logoEl.style.display = 'none';
  }
}
window._applyLogoToHeader = _applyLogoToHeader;

window.showAdminInfo = function () {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const cfg = window.APP.config || {};
  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('schoolInfo.title')}</h3>
      <div class="info-row"><span>${t('more.schoolId')}</span><code>${esc(window.APP.school_id)}</code></div>
      <div class="info-row"><span>${t('schoolInfo.name')}</span><span>${esc(window.APP.school_name)}</span></div>
      <div class="info-row"><span>${t('schoolInfo.subjects')}</span><span>${(cfg.subjects || []).length}</span></div>
      <div class="info-row"><span>${t('schoolInfo.attCodes')}</span><span>${(cfg.attendance_codes || []).map(c=>esc(c.code)).join(', ')}</span></div>
      <div class="info-row"><span>${t('schoolInfo.currency')}</span><span>${esc(cfg.currency || 'USD')}</span></div>
      <p style="font-size:12px;color:var(--muted);margin-top:16px">
        ${t('schoolInfo.hint')}
      </p>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>`;
  openModal(html);
};

/* ─── Manage classes & grades (admin) ──────────────────────────── */

window.openManageClassesModal = function () {
  if (!window.APP.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const cfg = window.APP.config || {};
  const classes = window.getClassList();
  const grades = window.getGradeList();
  const classGradeMap = (cfg.class_grade_map && typeof cfg.class_grade_map === 'object')
    ? { ...cfg.class_grade_map } : {};

  // Preserve existing school data: infer missing pairs from enrolled students.
  (window.APP.students || []).forEach(s => {
    if (s.class && s.grade && !classGradeMap[s.class]) classGradeMap[s.class] = s.grade;
  });

  const renderRows = () => {
    const current = window.getClassList();
    const map = window.APP.config?.class_grade_map || {};
    return current.length
      ? current.map(cls => `
          <div class="cg-row cg-pair-row">
            <div class="cg-pair-main">
              <span class="cg-name">${esc(cls)}</span>
              <span class="cg-pair-arrow">→</span>
              <span class="cg-pair-grade">${esc(map[cls] || '—')}</span>
            </div>
            <button class="cg-remove" onclick="_cgRemoveClass('${esc(cls)}')" aria-label="${esc(t('picker.remove'))}">×</button>
          </div>`).join('')
      : `<div class="cg-empty">${t('cg.none')}</div>`;
  };

  window.APP.config.class_grade_map = classGradeMap;

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('more.classes')}</h3>
      <p class="modal-subtitle">${t('cg.pairHint')}</p>

      <div class="cg-pair-card">
        <div class="cg-pair-card-title">Class + Grade</div>
        <div class="cg-add-pair-row">
          <div class="cg-add-field">
            <label class="field-label">${t('cg.classes')}</label>
            <input type="text" class="form-input" id="cgClassInput" placeholder="${esc(t('cg.classPh'))}" maxlength="20" autocomplete="off">
          </div>
          <div class="cg-add-field">
            <label class="field-label">${t('cg.grades')}</label>
            <input type="text" class="form-input" id="cgGradeInput" list="cgGradeSuggestions" placeholder="${esc(t('cg.gradePh'))}" maxlength="20" autocomplete="off">
            <datalist id="cgGradeSuggestions">
              ${grades.map(g => `<option value="${esc(g)}"></option>`).join('')}
            </datalist>
          </div>
          <button type="button" class="btn-primary cg-add-pair-btn" onclick="_cgAddPair()">
            ${t('common.add')}
          </button>
        </div>
        <div class="form-help cg-pair-help">${t('cg.pairExample')}</div>
      </div>

      <div class="cg-section">
        <div class="cg-section-head">
          <span class="cg-section-title">${t('cg.classGrade')}</span>
          <span class="cg-section-count" id="cgPairCount">${classes.length}</span>
        </div>
        <div class="cg-list" id="cgPairList">${renderRows()}</div>
      </div>

      <div class="cg-section">
        <div class="cg-section-head">
          <span class="cg-section-title">${t('cg.grades')}</span>
          <span class="cg-section-count">${grades.length}</span>
        </div>
        <div class="cg-grade-chips">
          ${grades.length ? grades.map(g => `<span class="cg-grade-chip">${esc(g)}</span>`).join('') : `<span class="cg-empty">${t('cg.none')}</span>`}
        </div>
      </div>

      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.done')}</button>
    </div>`
  );

  window._cgRenderRows = renderRows;
};

let _cgSaveInFlight = false;

function _cgSetSaveBusy(busy) {
  _cgSaveInFlight = !!busy;
  document.querySelectorAll('.cg-add-pair-btn, .cg-remove').forEach((button) => {
    button.disabled = !!busy;
  });
}

window._cgAddPair = async function () {
  if (_cgSaveInFlight) return;
  const classInput = document.getElementById('cgClassInput');
  const gradeInput = document.getElementById('cgGradeInput');
  const cls = (classInput?.value || '').trim();
  const grade = (gradeInput?.value || '').trim();
  if (!cls || !grade) {
    showToast(t('cg.required'));
    return;
  }

  const cfg = window.APP.config || {};
  const classes = Array.isArray(cfg.classes) ? cfg.classes.slice() : window.getClassList();
  const grades = Array.isArray(cfg.grades) ? cfg.grades.slice() : window.getGradeList();
  const map = (cfg.class_grade_map && typeof cfg.class_grade_map === 'object') ? { ...cfg.class_grade_map } : {};

  if (!classes.includes(cls)) classes.push(cls);
  if (!grades.includes(grade)) grades.push(grade);
  map[cls] = grade;

  const saved = await _cgSavePaired({ classes, grades, class_grade_map: map });
  if (!saved) return;

  const list = document.getElementById('cgPairList');
  if (list && typeof window._cgRenderRows === 'function') list.innerHTML = window._cgRenderRows();
  const count = document.getElementById('cgPairCount');
  if (count) count.textContent = classes.length;
  if (classInput) classInput.value = '';
  if (gradeInput) gradeInput.value = '';
  classInput?.focus();
};

window._cgRemoveClass = async function (cls) {
  if (_cgSaveInFlight) return;
  if (!confirm(t('cg.confirmRemove', { value: cls, list: t('picker.list.classes') }))) return;

  const cfg = window.APP.config || {};
  const classes = (Array.isArray(cfg.classes) ? cfg.classes : window.getClassList()).filter(x => x !== cls);
  const grades = Array.isArray(cfg.grades) ? cfg.grades.slice() : window.getGradeList();
  const map = (cfg.class_grade_map && typeof cfg.class_grade_map === 'object') ? { ...cfg.class_grade_map } : {};
  delete map[cls];

  const saved = await _cgSavePaired({ classes, grades, class_grade_map: map });
  if (!saved) return;

  const list = document.getElementById('cgPairList');
  if (list && typeof window._cgRenderRows === 'function') list.innerHTML = window._cgRenderRows();
  const count = document.getElementById('cgPairCount');
  if (count) count.textContent = classes.length;
};

async function _cgSavePaired(updated) {
  if (_cgSaveInFlight) return false;
  _cgSetSaveBusy(true);
  try {
    const res = await API.updateSchoolConfig(updated);
    if (res && (res.ok === true || res.success === true)) {
      window.APP.config = window.APP.config || {};
      Object.assign(window.APP.config, updated);
      showToast(t('common.saved'));
      return true;
    }
    showToast(t('common.saveFailedShort'));
    return false;
  } catch (e) {
    showToast(t('cg.couldNotSave', { err: e.message || t('common.unknown') }));
    return false;
  } finally {
    _cgSetSaveBusy(false);
  }
}