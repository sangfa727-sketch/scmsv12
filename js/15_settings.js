/**
 * SCMS v11 — 15_settings.js
 * Settings panel — multi-tenant, no URL/key setup needed.
 */

'use strict';

function _loginMethodLabel(isWeb) {
  if (!isWeb) return t('settings.telegram');
  const mode = window.APP.webSession?.auth_mode;
  if (mode === 'google') return t('settings.googleAccount');
  return t('settings.webPassword');
}

/* Teacher manager performance cache. */
let _teacherManagerCache = null;
let _teacherManagerLoadPromise = null;
const TEACHER_MANAGER_CACHE_TTL = 30000;

function _teacherManagerCacheFresh() {
  return !!(_teacherManagerCache &&
    Array.isArray(_teacherManagerCache.rows) &&
    (Date.now() - _teacherManagerCache.at) < TEACHER_MANAGER_CACHE_TTL);
}
function _invalidateTeacherManagerCache() { _teacherManagerCache = null; }
function _teacherProfileFromCache(teacherId) {
  const rows = Array.isArray(_teacherManagerCache?.rows) ? _teacherManagerCache.rows : [];
  return rows.find(row => row.teacher_id === teacherId) || null;
}
async function _fetchTeacherManagerRows() {
  if (_teacherManagerCacheFresh()) return _teacherManagerCache.rows;
  if (_teacherManagerLoadPromise) return _teacherManagerLoadPromise;
  _teacherManagerLoadPromise = (async () => {
    let sess = getWebSession();
    if (!sess?.session_token) throw new Error('Web session is missing or expired');
    try {
      const res = await _webRpc('rpc_admin_list_teachers', { p_session_token: sess.session_token });
      const rows = Array.isArray(res?.rows) ? res.rows : [];
      _teacherManagerCache = { rows, at: Date.now() };
      return rows;
    } catch (firstError) {
      if (typeof verifyWebSession === 'function') {
        const verified = await verifyWebSession();
        if (verified?.session_token) {
          window.APP.webSession = verified;
          sess = verified;
          const res = await _webRpc('rpc_admin_list_teachers', { p_session_token: sess.session_token });
          const rows = Array.isArray(res?.rows) ? res.rows : [];
          _teacherManagerCache = { rows, at: Date.now() };
          return rows;
        }
      }
      throw firstError;
    } finally {
      _teacherManagerLoadPromise = null;
    }
  })();
  return _teacherManagerLoadPromise;
}
function _prefetchTeacherManagerList() { _fetchTeacherManagerRows().catch(() => {}); }


window.openSettings = function() {
  const isWeb   = !!(window.APP && window.APP.webSession);
  const isAdmin = !!(window.APP && window.APP.is_admin);

  const html = `
    <div class="modal-sheet settings-modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('settings.title')}</h3>

      <div class="info-row"><span>${t('settings.version')}</span><span>v${esc(SCMS_CONFIG.VERSION)}</span></div>
      <div class="info-row"><span>${t('settings.platform')}</span><span>${esc(window.APP.platform)}</span></div>
      <div class="info-row"><span>${t('settings.school')}</span><span>${esc(window.APP.school_name)}</span></div>
      <div class="info-row"><span>${t('settings.teacher')}</span><span>${esc(window.APP.teacher_name)}</span></div>
      <div class="info-row"><span>${t('settings.role')}</span><span>${esc(window.APP.teacher_role)}</span></div>
      <div class="info-row"><span>${t('settings.login')}</span><span>${esc(_loginMethodLabel(isWeb))}</span></div>
      <div class="info-row"><span>${t('settings.telegram')}</span><span>${window.APP.telegram_id ? t('settings.connected') : t('settings.notConnected')}</span></div>

      <section class="settings-actions" aria-label="${t('settings.actionsLabel')}">
        <div class="settings-theme-control" role="group" aria-label="${t('settings.theme')}">
          <div class="settings-action-copy">
            <strong>${t('settings.theme')}</strong>
            <span class="settings-theme-current" id="settingsThemeCurrent"></span>
          </div>
          <div class="settings-theme-toggle" role="radiogroup" aria-label="${t('settings.theme')}">
            <button type="button" class="settings-theme-option" data-theme-choice="light" role="radio" onclick="SCMSTheme.set('light'); refreshSettingsThemeControl()">${t('settings.themeLight')}</button>
            <button type="button" class="settings-theme-option" data-theme-choice="dark" role="radio" onclick="SCMSTheme.set('dark'); refreshSettingsThemeControl()">${t('settings.themeDark')}</button>
          </div>
        </div>
        <div class="settings-action-list">
          ${isAdmin ? `
            <div class="settings-action-row">
              <div class="settings-action-copy"><strong>${t('settings.manageTeachers')}</strong></div>
              <button type="button" class="settings-action-button settings-action-primary" onclick="closeModal(); setTimeout(() => openTeacherManager(), 190)">${t('settings.manageTeachers')}</button>
            </div>
          ` : ''}

          ${isWeb && !window.APP.telegram_id ? `
            <div class="settings-action-row">
              <div class="settings-action-copy"><strong>${t('settings.connectTelegram')}</strong></div>
              <button type="button" class="settings-action-button" onclick="closeModal(); openTelegramConnectModal()">${t('settings.connectTelegram')}</button>
            </div>
          ` : ''}

          ${isWeb && window.APP.telegram_id ? `
            <div class="settings-action-row">
              <div class="settings-action-copy"><strong>${t('settings.disconnectTelegram')}</strong></div>
              <button type="button" class="settings-action-button settings-action-danger" onclick="disconnectTelegram()">${t('settings.disconnectTelegram')}</button>
            </div>
          ` : ''}

          ${isWeb && window.APP.webSession?.auth_mode !== 'google' ? `
            <div class="settings-action-row">
              <div class="settings-action-copy"><strong>${t('settings.changePassword')}</strong></div>
              <button type="button" class="settings-action-button" onclick="closeModal(); openChangePasswordModal()">${t('settings.changePassword')}</button>
            </div>
          ` : ''}

          ${isWeb ? `
            <div class="settings-action-row">
              <div class="settings-action-copy"><strong>${t('sb.signout')}</strong></div>
              <button type="button" class="settings-action-button settings-action-danger" onclick="webLogout()">${t('sb.signout')}</button>
            </div>
          ` : ''}
        </div>
      </section>

      <p class="settings-footer-note">
        ${t('settings.footerNote')}
      </p>

      <button class="btn-secondary settings-close" onclick="closeModal()">${t('common.close')}</button>
    </div>`;


  openModal(html);
  refreshSettingsThemeControl();
  if (isAdmin) _prefetchTeacherManagerList();
};

window.refreshSettingsThemeControl = function() {
  const current = window.SCMSTheme?.current?.() || 'light';
  const label = document.getElementById('settingsThemeCurrent');
  if (label) label.textContent = current === 'dark' ? t('settings.themeDark') : t('settings.themeLight');
  document.querySelectorAll('.settings-theme-option').forEach(btn => {
    const selected = btn.dataset.themeChoice === current;
    btn.setAttribute('aria-checked', selected ? 'true' : 'false');
    btn.setAttribute('aria-label', btn.textContent.trim());
  });
};


/* ============================================================================
   TEACHER MANAGER (admin only)
============================================================================ */
window.openTeacherManager = async function() {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const cachedRows = _teacherManagerCacheFresh() ? _teacherManagerCache.rows : null;

  openModal(`
    <div class="modal-sheet teacher-manager-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('tm.title')}</h3>
      <p class="modal-subtitle">${t('tm.subtitle')}</p>
      <div class="teacher-manager-actions">
        <button type="button" class="btn-primary teacher-manager-action-btn" onclick="openCreateTeacherModal()">${t('tm.addNew')}</button>
        <button type="button" class="btn-secondary teacher-manager-action-btn" onclick="openInviteCodeModal()">${t('tm.inviteGoogle')}</button>
      </div>
      <div id="teacherList" class="teacher-list mt16">
        ${cachedRows ? '' : `<div class="teacher-manager-loading" aria-busy="true">
          <span class="teacher-manager-loading-dot"></span>
          <span>${t('tm.loading')}</span>
        </div>`}
      </div>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>
  `);

  if (cachedRows) _renderTeacherList(cachedRows);

  try {
    const rows = await _fetchTeacherManagerRows();
    const listEl = document.getElementById('teacherList');
    if (listEl) _renderTeacherList(rows);
  } catch (e) {
    const listEl = document.getElementById('teacherList');
    if (listEl && !cachedRows) {
      const msg = e?.message || String(e);
      listEl.innerHTML =
        `<div class="form-error">${esc(t('tm.loadFailed'))}<br><small>${esc(msg.slice(0, 180))}</small></div>`;
    }
  }
};

function _renderTeacherList(teachers) {
  const el = document.getElementById('teacherList');
  if (!el) return;
  if (!teachers.length) {
    el.innerHTML = `<div class="text-muted text-center">${t('tm.none')}</div>`;
    return;
  }
  el.innerHTML = teachers.map(teacher => {
    const lastLogin = teacher.last_web_login_at
      ? new Date(teacher.last_web_login_at).toLocaleDateString(I18N.dateLocale())
      : t('tm.never');
    const roleBadge = (teacher.role === 'admin' || teacher.role === 'super_admin') ? ' 👑' : '';
    const statusDot = teacher.status === 'active' ? '🟢' : '⚪';
    return `
      <div class="teacher-row teacher-row-card" data-tid="${esc(teacher.teacher_id)}" onclick="openTeacherEditModal('${esc(teacher.teacher_id)}')">
        <div class="teacher-row-info">
          <div class="teacher-row-name">${statusDot} ${esc(teacher.teacher_name)}${roleBadge}</div>
          <div class="teacher-row-sub">${esc(teacher.login_name || teacher.teacher_id)} · ${esc(teacher.teacher_id)} · ${esc(teacher.role ? tv('roleName', teacher.role) : t('inv.roleTeacher'))} · ${t('tm.lastLogin', { date: lastLogin })}</div>
        </div>
        <div class="teacher-row-actions">
          <button class="icon-btn-mini teacher-edit-btn" onclick="event.stopPropagation(); openTeacherEditModal('${esc(teacher.teacher_id)}')" title="${esc(t('common.edit'))}">✏️</button>
          <button class="icon-btn-mini teacher-access-btn" onclick="event.stopPropagation(); closeModal(); setTimeout(() => openTeacherAccess('${esc(teacher.teacher_id)}', '${esc(teacher.teacher_name)}'), 190)" title="${esc(t('tm.title'))}">🔐</button>
          <button class="icon-btn-mini" onclick="event.stopPropagation(); openTeacherCardModal('${esc(teacher.teacher_id)}', '${esc(teacher.teacher_name)}', '${esc(teacher.login_name || '')}')" title="${esc(t('tm.idCard'))}">🪪</button>
          <button class="icon-btn-mini" onclick="event.stopPropagation(); resetTeacherPassword('${esc(teacher.teacher_id)}', '${esc(teacher.teacher_name)}')" title="${esc(t('tm.resetPassword'))}">🔑</button>
        </div>
      </div>`;
  }).join('');
}

/* ============================================================================
   INVITE VIA GOOGLE (admin only) — v11.7
   Alternative to password-based accounts: admin generates a short code,
   shares it out-of-band, the teacher signs in with their own Google account
   and redeems the code to join this school.
============================================================================ */
window.openInviteCodeModal = function() {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  openModal(`
    <div class="modal-sheet settings-form-sheet" onclick="event.stopPropagation()" style="max-width:380px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('inv.title')}</h3>
      <p class="modal-subtitle">${t('inv.subtitle')}</p>

      <label class="field-label">${t('inv.name')}</label>
      <input class="form-input" id="invTName" placeholder="${esc(t('inv.namePh'))}">

      <label class="field-label">${t('inv.role')}</label>
      <select class="form-input" id="invTRole">
        <option value="teacher">${t('inv.roleTeacher')}</option>
        <option value="admin">${t('inv.roleAdmin')}</option>
      </select>

      <div class="modal-footer">
<button class="btn-primary mt16" id="invGenBtn" onclick="doGenerateInvite()">${t('inv.generate')}</button>

      <div id="invCodeResult" style="display:none" class="mt16">
        <div class="info-row"><span>${t('inv.codeLabel')}</span><span id="invCodeValue" style="font-weight:700;letter-spacing:2px"></span></div>
        <p class="form-help">${t('inv.hint')}</p>
      </div>

      <div id="invPastList" class="mt16"></div>

      <button class="btn-secondary mt16" onclick="closeModal(); openTeacherManager()">${t('inv.back')}</button>
    </div>
  `);
  _loadPastInvites();
};

window.doGenerateInvite = async function() {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const name = document.getElementById('invTName')?.value.trim() || null;
  const role = document.getElementById('invTRole')?.value;
  const btn = document.getElementById('invGenBtn');
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.textContent = t('inv.generating');

  try {
    const result = await createTeacherInvite(role, name);
    if (!result || !result.ok) {
      showToast(t('inv.failed', { err: result?.message || result?.error || t('common.unknown') }));
      return;
    }

    document.getElementById('invCodeResult').style.display = 'block';
    document.getElementById('invCodeValue').textContent = result.invite_code;
    await _loadPastInvites();
  } catch (e) {
    showToast(t('inv.failed', { err: e?.message || t('common.unknown') }));
  } finally {
    btn.disabled = false;
    btn.textContent = t('inv.generate');
  }
};

async function _loadPastInvites() {
  const el = document.getElementById('invPastList');
  if (!el) return;
  const result = await listTeacherInvites();
  if (!result || !result.ok || !result.invites?.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="field-label">${t('inv.pastInvites')}</div>` + result.invites.map(inv => {
    const status = inv.redeemed_at
      ? t('inv.usedBy', { id: esc(inv.redeemed_by_teacher_id || '') })
      : (new Date(inv.expires_at) < new Date() ? t('inv.expired') : t('inv.pending'));
    return `<div class="info-row"><span>${esc(inv.invite_code)} (${esc(inv.role)})</span><span>${status}</span></div>`;
  }).join('');
}

window.openCreateTeacherModal = function() {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  openModal(`
    <div class="modal-sheet settings-form-sheet" onclick="event.stopPropagation()" style="max-width:380px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('ct.title')}</h3>
      <p class="modal-subtitle">${t('ct.subtitle')}</p>

      <label class="field-label">${t('ct.teacherId')}</label>
      <input class="form-input" id="newTId" placeholder="${esc(t('ct.teacherIdPh'))}" autocapitalize="off">

      <label class="field-label">${t('ct.loginName')}</label>
      <input class="form-input" id="newTLogin" placeholder="${esc(t('ct.loginNamePh'))}" autocapitalize="off" autocorrect="off">

      <label class="field-label">${t('ct.teacherName')}</label>
      <input class="form-input" id="newTName" placeholder="${esc(t('inv.namePh'))}">

      <label class="field-label">${t('ct.email')}</label>
      <input class="form-input" id="newTEmail" type="email" placeholder="teacher@school.edu">

      <label class="field-label">${t('inv.role')}</label>
      <select class="form-input" id="newTRole">
        <option value="teacher">${t('inv.roleTeacher')}</option>
        <option value="admin">${t('ct.roleAdmin')}</option>
      </select>

      <label class="field-label">${t('ct.startPw')}</label>
      <input class="form-input" id="newTPw" type="text" placeholder="temp1234" value="temp1234">
      <p class="form-help">${t('ct.startPwHint')}</p>

      <div id="newTError" class="form-error" style="display:none"></div>

      <button class="btn-primary mt16" id="newTBtn" onclick="doCreateTeacher()">${t('ct.create')}</button>
<button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
</div>
    </div>
  `);
};

window.openTeacherEditModal = async function(teacherId) {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const sess = getWebSession();
  if (!sess?.session_token) { showToast(t('ct.sessionExpired')); return; }
  let teachers = [];
  try {
    const res = await _webRpc('rpc_admin_list_teachers', { p_session_token: sess.session_token });
    teachers = Array.isArray(res?.rows) ? res.rows : [];
  } catch (_) {}
  const teacher = teachers.find(row => row.teacher_id === teacherId);
  if (!teacher) { showToast(t('tm.loadFailed')); return; }

  openModal(`
    <div class="modal-sheet settings-form-sheet teacher-edit-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">✏️ ${t('teacher.editTitle')}</h3>
      <p class="modal-subtitle">${t('teacher.editSubtitle')}</p>
      <label class="field-label">${t('ct.teacherId')}</label>
      <input class="form-input" value="${esc(teacher.teacher_id)}" readonly>
      <label class="field-label">${t('ct.loginName')}</label>
      <input class="form-input" id="editTLogin" value="${esc(teacher.login_name || '')}" autocapitalize="off" autocorrect="off">
      <label class="field-label">${t('ct.teacherName')}</label>
      <input class="form-input" id="editTName" value="${esc(teacher.teacher_name || '')}">
      <label class="field-label">${t('ct.email')}</label>
      <input class="form-input" id="editTEmail" type="email" value="${esc(teacher.email || teacher.teacher_email || '')}">
      <label class="field-label">${t('inv.role')}</label>
      <select class="form-input" id="editTRole">
        <option value="teacher" ${teacher.role === 'teacher' ? 'selected' : ''}>${t('inv.roleTeacher')}</option>
        <option value="admin" ${teacher.role === 'admin' ? 'selected' : ''}>${t('inv.roleAdmin')}</option>
        <option value="super_admin" ${teacher.role === 'super_admin' ? 'selected' : ''}>${t('teacher.superAdmin')}</option>
      </select>
      <div id="editTError" class="form-error" style="display:none"></div>
      <button class="btn-primary mt16" id="editTBtn" onclick="saveTeacherEdit('${esc(teacher.teacher_id)}')">${t('common.saveChanges')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window.saveTeacherEdit = async function(teacherId) {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const btn = document.getElementById('editTBtn');
  const err = document.getElementById('editTError');
  const login = document.getElementById('editTLogin')?.value.trim() || '';
  const name = document.getElementById('editTName')?.value.trim() || '';
  const email = document.getElementById('editTEmail')?.value.trim() || null;
  const role = document.getElementById('editTRole')?.value || 'teacher';
  if (!login || !name) { err.textContent = t('teacher.updateRequired'); err.style.display = 'block'; return; }
  const sess = getWebSession();
  if (!sess?.session_token) { err.textContent = t('ct.sessionExpired'); err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = t('common.saving');
  try {
    const result = await _webRpc('rpc_admin_update_teacher_profile', {
      p_session_token: sess.session_token, p_teacher_id: teacherId,
      p_teacher_name: name, p_login_name: login, p_email: email, p_role: role
    });
    if (!result?.ok) throw new Error(result?.error || 'save_failed');
    _invalidateTeacherManagerCache();
    closeModal(); showToast(t('toast.updated'));
    setTimeout(() => openTeacherManager(), 190);
  } catch (e) {
    err.textContent = e?.message || String(e); err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = t('common.saveChanges');
  }
};

window.doCreateTeacher = async function() {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  const id    = document.getElementById('newTId')?.value.trim();
  const login = document.getElementById('newTLogin')?.value.trim();
  const name  = document.getElementById('newTName')?.value.trim();
  const email = document.getElementById('newTEmail')?.value.trim() || null;
  const role  = document.getElementById('newTRole')?.value;
  const pw    = document.getElementById('newTPw')?.value;
  const errEl = document.getElementById('newTError');
  const btn   = document.getElementById('newTBtn');
  errEl.style.display = 'none';

  if (!id || !login || !name || !pw) {
    errEl.textContent = t('ct.needFields');
    errEl.style.display = 'block';
    return;
  }
  if (pw.length < 6) {
    errEl.textContent = t('ct.pwTooShort');
    errEl.style.display = 'block';
    return;
  }

  const sess = getWebSession();
  if (!sess || !sess.session_token) {
    errEl.textContent = t('ct.sessionExpired');
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = t('ct.creating');

  try {
    const result = await _webRpc('rpc_admin_create_teacher_v2', {
      p_session_token:    sess.session_token,
      p_teacher_id:       id,
      p_login_name:       login,
      p_teacher_name:     name,
      p_initial_pin:      pw,
      p_role:             role,
      p_email:            email,
    });
    if (!result || !result.ok) {
      errEl.textContent = (result && result.message) || t('ct.createFailed');
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = t('ct.create');
      return;
    }
    _invalidateTeacherManagerCache();
    closeModal();
    showToast(t('ct.created'));
    // A newly-created teacher should receive their secure ID card immediately.
    // The card RPC generates a fresh token and revokes any previous active card.
    setTimeout(() => openTeacherCardModal(id, name, login), 280);
  } catch (e) {
    errEl.textContent = t('ct.connErr');
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = t('ct.create');
  }
};

// Regression contract: Teacher ID remains the stable ID-card field label.
window.openTeacherCardModal = async function(teacherId, teacherName, teacherLoginName) {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  openModal('<div class="modal-sheet teacher-card-modal teacher-card-preparing" onclick="event.stopPropagation(); closeTeacherCardHelp()" style="visibility:hidden"><div class="modal-handle"></div><h3 class="modal-title">🪪 ' + esc(t('tm.idCard')) + '</h3><div id="teacherCardRoot" class="teacher-card-root"><div class="text-center text-muted">' + esc(t('tm.cardLoading')) + '</div></div><button class="btn-secondary mt16" onclick="closeModal()">' + esc(t('common.close')) + '</button></div>');
  try {
    const sess = getWebSession();
    if (!sess?.session_token) throw new Error('session_expired');
    const result = await _webRpc('rpc_admin_create_teacher_card', { p_session_token: sess.session_token, p_teacher_id: teacherId });
    const teacherProfile = _teacherProfileFromCache(teacherId);
    const root = document.getElementById('teacherCardRoot');
    if (!root) return;
    if (!result?.ok) throw new Error(result?.error || 'card_failed');

    const loginUrl = location.origin + location.pathname + '#teacher_card=' + encodeURIComponent(result.token);
    const resolvedName = teacherProfile?.teacher_name || result.teacher_name || teacherName || '';
    const resolvedLogin = teacherProfile?.login_name || result.login_name || teacherLoginName || '';
    const photoValue = teacherProfile?.photo_url || result.photo_url || '';
    const photo = typeof photoValue === 'string' ? photoValue.trim() : '';
    const role = teacherProfile?.role || result.role || 'teacher';
    const schoolLogo = window.APP?.school_logo || (window.APP?.config && window.APP.config.school_logo) || '';

    root.innerHTML = '<div class="teacher-id-card teacher-id-card-vertical">' +
      '<div class="teacher-id-card-face">' +
        '<div class="teacher-id-card-brand">' +
          (window.APP?.school_logo ? '<img src="' + esc(window.APP.school_logo) + '" alt="" class="teacher-id-card-logo">' : '') +
          '<div class="teacher-id-card-school">' + esc(window.APP?.school_name || '') + '</div>' +
        '</div>' +
        '<div class="teacher-id-card-type">' + esc(t('tm.idCard')) + '</div>' +
        '<div class="teacher-id-card-avatar' + (photo ? ' has-photo' : '') + '">' +
          (photo ? '<img src="' + esc(photo) + '" alt="' + esc(resolvedName) + '" referrerpolicy="no-referrer" onload="this.parentElement.classList.add(\'has-photo\')" onerror="this.style.display=\'none\';this.parentElement.classList.remove(\'has-photo\');this.parentElement.classList.add(\'is-fallback\')">' : '') +
          '<span class="teacher-id-card-avatar-fallback">👤</span>' +
        '</div>' +
        '<div class="teacher-id-card-who">' +
          '<div class="teacher-id-card-name">' + esc(resolvedName || '—') + '</div>' +
          '<div class="teacher-id-card-role">' + esc(role) + '</div>' +
        '</div>' +
        '<div class="teacher-id-card-fields">' +
          '<div><span>' + esc(t('ct.teacherId')) + '</span><strong>' + esc(result.teacher_id || teacherId) + '</strong></div>' +
          '<div><span>' + esc(t('ct.loginName')) + '</span><strong>' + esc(resolvedLogin || '—') + '</strong></div>' +
        '</div>' +
        '<div class="teacher-id-card-qr" data-token="' + esc(result.token) + '" aria-label="' + esc(t('tm.idCard')) + '"></div>' +
        '<div class="teacher-id-card-instruction">' + esc(t('tm.cardScan')) + '</div>' +
        '<div class="teacher-id-card-security">' + esc(t('tm.cardPurpose')) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="teacher-id-card-help-wrap">' +
      '<button class="teacher-id-card-help-trigger" type="button" aria-label="' + esc(t('tm.cardPurposeTitle')) + '" aria-expanded="false" onclick="toggleTeacherCardHelp(event)">ℹ️</button>' +
      '<div class="teacher-id-card-help-popover" id="teacherCardHelp" hidden>' +
        '<div class="teacher-id-card-help-title">' + esc(t('tm.cardPurposeTitle')) + '</div>' +
        '<div>' + esc(t('tm.cardPurpose')) + '</div>' +
        '<ol><li>' + esc(t('tm.cardStep1')) + '</li><li>' + esc(t('tm.cardStep2')) + '</li><li>' + esc(t('tm.cardStep3')) + '</li></ol>' +
        '<div class="teacher-id-card-help-note">' + esc(t('tm.cardSecurity')) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="teacher-card-actions"><button class="btn-primary" type="button" onclick="printTeacherCard()">' + esc(t('tm.printCard')) + '</button><button class="btn-secondary" type="button" onclick="regenerateTeacherCard(&quot;' + esc(teacherId) + '&quot;,&quot;' + esc(teacherName) + '&quot;)">' + esc(t('tm.regenerateCard')) + '</button></div>';

    const qrEl = root.querySelector('.teacher-id-card-qr');
    _renderTeacherCardQr(qrEl, loginUrl);
    const sheet = document.querySelector('.teacher-card-modal');
    if (sheet) {
      sheet.classList.remove('teacher-card-preparing');
      sheet.classList.add('teacher-card-ready');
      sheet.style.visibility = 'visible';
    }
  } catch (e) {
    const root = document.getElementById('teacherCardRoot');
    if (root) root.innerHTML = '<div class="form-error">' + esc(t('tm.cardFailed')) + '<br><small>' + esc(e?.message || String(e)) + '</small></div>';
    const sheet = document.querySelector('.teacher-card-modal');
    if (sheet) {
      sheet.classList.remove('teacher-card-preparing');
      sheet.classList.add('teacher-card-ready');
      sheet.style.visibility = 'visible';
    }
  }
};

function _renderTeacherCardQr(el, value) {
  if (!el || !value) return;
  el.innerHTML = '';
  const QR = window.QRCode;

  if (QR && typeof QR.toCanvas === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = 148;
    canvas.height = 148;
    el.appendChild(canvas);
    QR.toCanvas(canvas, value, { width: 148, margin: 1, errorCorrectionLevel: 'M' }, (err) => {
      if (err) {
        el.innerHTML = '';
        _renderTeacherCardQrLegacy(el, value);
      }
    });
    return;
  }

  _renderTeacherCardQrLegacy(el, value);
}

// Khmer i18n-safe QR fallback; keep interpolation outside single-quoted literals.
function _renderTeacherCardQrLegacy(el, value) {
  const QR = window.QRCode;
  if (typeof QR !== 'function') {
    el.innerHTML = '<span class="teacher-id-card-qr-error">' + t('teacher.qrUnavailable') + '</span>';
    return;
  }
  try {
    new QR(el, {
      text: value,
      width: 148,
      height: 148,
      correctLevel: QR.CorrectLevel?.M || 0
    });
  } catch (_) {
    el.innerHTML = '<span class="teacher-id-card-qr-error">' + t('teacher.qrUnavailable') + '</span>';
  }
}

window.toggleTeacherCardHelp = function(event) {
  event.stopPropagation();
  const wrap = event.currentTarget?.closest('.teacher-id-card-help-wrap');
  const popover = wrap?.querySelector('.teacher-id-card-help-popover');
  if (!popover) return;
  const open = popover.hasAttribute('hidden');
  if (open) popover.removeAttribute('hidden');
  else popover.setAttribute('hidden', '');
  event.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
};
window.closeTeacherCardHelp = function() {
  const popover = document.getElementById('teacherCardHelp');
  const trigger = document.querySelector('.teacher-id-card-help-trigger');
  if (popover) popover.setAttribute('hidden', '');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
};
window.printTeacherCard = function() {
  const card = document.querySelector('.teacher-id-card');
  const area = document.getElementById('bulkIdPrintArea');
  if (!card || !area) return;

  area.innerHTML = card.outerHTML;
  document.body.classList.add('printing-teacher-card');

  const pageStyle = document.createElement('style');
  pageStyle.id = 'teacherCardPrintPageStyle';
  pageStyle.textContent = '@page { size: 2.125in 3.375in; margin: 0; }';
  document.head.appendChild(pageStyle);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove('printing-teacher-card');
    area.innerHTML = '';
    pageStyle.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 1200);
};

window.regenerateTeacherCard = function(teacherId, teacherName) {
  closeModal();
  setTimeout(()=>openTeacherCardModal(teacherId,teacherName),190);
};

window.resetTeacherPassword = function(teacherId, teacherName) {
  if (!window.APP?.is_admin) {
    showToast(t('cg.adminOnly'));
    return;
  }

  if (typeof window.showPasswordPrompt !== 'function') {
    showToast(t('ct.connErr'));
    return;
  }

  window.showPasswordPrompt(
    t('tm.resetPassword'),
    t('rp.prompt', { name: teacherName, id: teacherId }),
    async (newPw) => {
      if (!newPw) return;
      if (newPw.length < 6) {
        showToast(t('ct.pwTooShort'));
        return;
      }

      const sess = getWebSession();
      if (!sess || !sess.session_token) {
        showToast(t('rp.sessionExpired'));
        return;
      }

      try {
        const result = await _webRpc('rpc_admin_reset_teacher_password', {
          p_session_token: sess.session_token,
          p_teacher_id:    teacherId,
          p_new_password:  newPw,
        });
        if (!result || !result.ok) {
          showToast(t('rp.failed', { err: result?.error || t('common.unknown') }));
          return;
        }
        showToast(t('rp.done', { name: teacherName, pw: newPw }));
      } catch (e) {
        showToast(t('ct.connErr'));
      }
    }
  );
};
