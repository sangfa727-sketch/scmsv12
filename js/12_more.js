/**
 * SCMS v11 — 12_more.js
 * More menu: quick actions, admin tools, school info, chat (native only),
 * school logo display and upload (admin only).
 */

'use strict';

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
  return Array.isArray(saved) ? saved : MODULE_ITEMS.map(m => m.id);
};

let _modulesDraft = null;   // Set of ids ticked in the open sheet (not saved yet)

window.openModulesMenu = function () {
  _modulesDraft = new Set(getSidebarModuleIds());
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('modules.title')}</h3>
      <p class="modal-subtitle">${t('modules.hint')}</p>
      <div class="more-grid" style="padding:8px 0 4px">
        ${MODULE_ITEMS.map(m => `
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
  closeModal();
  setTimeout(() => goToPage(pageId), 150);
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

      <button class="btn-danger solid mt16" onclick="_doSignOutConfirmed()">${t('sb.signout')}</button>
      <button class="btn-secondary mt8" onclick="_closeSignOutConfirm()">${t('common.cancel')}</button>
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

  const classes = window.getClassList();
  const grades  = window.getGradeList();

  const renderList = (items, listKey) => items.length
    ? items.map(v => `
        <div class="cg-row">
          <span class="cg-name">${esc(v)}</span>
          <button class="cg-remove" onclick="_cgRemove('${esc(listKey)}','${esc(v)}')" aria-label="${esc(t('picker.remove'))}">×</button>
        </div>`).join('')
    : `<div class="cg-empty">${t('cg.none')}</div>`;

  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('more.classes')}</h3>
      <p class="modal-subtitle">${t('cg.hint')}</p>

      <div class="cg-section">
        <div class="cg-section-head">
          <span class="cg-section-title">${t('cg.classes')}</span>
          <span class="cg-section-count">${classes.length}</span>
        </div>
        <div class="cg-list" id="cgClassList">${renderList(classes, 'classes')}</div>
        <div class="cg-add-row">
          <input type="text" class="form-input" id="cgClassInput" placeholder="${esc(t('cg.classPh'))}" maxlength="20">
          <button class="btn-primary" onclick="_cgAdd('classes','cgClassInput')">${t('common.add')}</button>
        </div>
      </div>

      <div class="cg-section">
        <div class="cg-section-head">
          <span class="cg-section-title">${t('cg.grades')}</span>
          <span class="cg-section-count">${grades.length}</span>
        </div>
        <div class="cg-list" id="cgGradeList">${renderList(grades, 'grades')}</div>
        <div class="cg-add-row">
          <input type="text" class="form-input" id="cgGradeInput" placeholder="${esc(t('cg.gradePh'))}" maxlength="20">
          <button class="btn-primary" onclick="_cgAdd('grades','cgGradeInput')">${t('common.add')}</button>
        </div>
      </div>

      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.done')}</button>
    </div>
  `);
};

window._cgAdd = async function (listKey, inputId) {
  const input = document.getElementById(inputId);
  const v = (input?.value || '').trim();
  if (!v) { showToast(t('picker.typeName')); return; }
  const cfg = window.APP.config || {};
  const cur = Array.isArray(cfg[listKey]) ? cfg[listKey].slice() : window[listKey === 'classes' ? 'getClassList' : 'getGradeList']();
  if (cur.includes(v)) { showToast(t('cg.exists')); return; }
  cur.push(v);
  await _cgSave(listKey, cur);
  // Re-open to refresh
  closeModal();
  setTimeout(openManageClassesModal, 200);
};

window._cgRemove = async function (listKey, value) {
  if (!confirm(t('cg.confirmRemove', { value, list: t('picker.list.' + listKey) }))) return;
  const cfg = window.APP.config || {};
  const cur = Array.isArray(cfg[listKey]) ? cfg[listKey] : window[listKey === 'classes' ? 'getClassList' : 'getGradeList']();
  await _cgSave(listKey, cur.filter(x => x !== value));
  closeModal();
  setTimeout(openManageClassesModal, 200);
};

async function _cgSave(listKey, updated) {
  try {
    const res = await API.updateSchoolConfig({ [listKey]: updated });
    if (res && (res.ok === true || res.success === true)) {
      window.APP.config = window.APP.config || {};
      window.APP.config[listKey] = updated;
      showToast(t('common.saved'));
    } else {
      showToast(t('common.saveFailedShort'));
    }
  } catch (e) {
    showToast(t('cg.couldNotSave', { err: e.message || t('common.unknown') }));
  }
}
