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

window.openSettings = function() {
  const isWeb   = !!(window.APP && window.APP.webSession);
  const isAdmin = !!(window.APP && window.APP.is_admin);

  const html = `
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('settings.title')}</h3>

      <div class="info-row"><span>${t('settings.version')}</span><span>v${esc(SCMS_CONFIG.VERSION)}</span></div>
      <div class="info-row"><span>${t('settings.platform')}</span><span>${esc(window.APP.platform)}</span></div>
      <div class="info-row"><span>${t('settings.school')}</span><span>${esc(window.APP.school_name)}</span></div>
      <div class="info-row"><span>${t('settings.teacher')}</span><span>${esc(window.APP.teacher_name)}</span></div>
      <div class="info-row"><span>${t('settings.role')}</span><span>${esc(window.APP.teacher_role)}</span></div>
      <div class="info-row"><span>${t('settings.login')}</span><span>${esc(_loginMethodLabel(isWeb))}</span></div>
      <div class="info-row"><span>${t('settings.telegram')}</span><span>${window.APP.telegram_id ? t('settings.connected') : t('settings.notConnected')}</span></div>

      ${isAdmin ? `
        <button class="btn-primary mt16" onclick="closeModal(); openTeacherManager()">
          ${t('settings.manageTeachers')}
        </button>
      ` : ''}

      ${isWeb && !window.APP.telegram_id ? `
        <button class="btn-secondary mt8" onclick="closeModal(); openTelegramConnectModal()">
          ${t('settings.connectTelegram')}
        </button>
      ` : ''}
      ${isWeb && window.APP.telegram_id ? `
        <button class="btn-secondary mt8" onclick="disconnectTelegram()">
          ${t('settings.disconnectTelegram')}
        </button>
      ` : ''}

      ${isWeb && window.APP.webSession?.auth_mode !== 'google' ? `
        <button class="btn-secondary mt8" onclick="closeModal(); openChangePasswordModal()">
          ${t('settings.changePassword')}
        </button>
      ` : ''}
      ${isWeb ? `
        <button class="btn-secondary mt8" onclick="webLogout()">
          ${t('sb.signout')}
        </button>
      ` : ''}

      <p class="settings-footer-note">
        ${t('settings.footerNote')}
      </p>

      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>`;

  openModal(html);
};


/* ============================================================================
   TEACHER MANAGER (admin only)
============================================================================ */
window.openTeacherManager = async function() {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:480px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('tm.title')}</h3>
      <p class="modal-subtitle">${t('tm.subtitle')}</p>

      <button class="btn-primary" onclick="openCreateTeacherModal()">${t('tm.addNew')}</button>
      <button class="btn-secondary mt8" onclick="openInviteCodeModal()">${t('tm.inviteGoogle')}</button>

      <div id="teacherList" class="teacher-list mt16">
        <div class="text-center text-muted">${t('tm.loading')}</div>
      </div>

      <button class="btn-secondary mt16" onclick="closeModal()">${t('common.close')}</button>
    </div>
  `);

  // Load teachers from the same school
  try {
    const res = await _webRpc('rpc_admin_list_teachers', {
      p_session_token: getWebSession()?.session_token,
    });
    _renderTeacherList(res.rows || []);
  } catch (e) {
    document.getElementById('teacherList').innerHTML =
      `<div class="form-error">${t('tm.loadFailed')}</div>`;
  }
};

function _renderTeacherList(teachers) {
  const el = document.getElementById('teacherList');
  if (!el) return;
  if (!teachers.length) {
    el.innerHTML = `<div class="text-muted text-center">${t('tm.none')}</div>`;
    return;
  }
  el.innerHTML = teachers.map(t => {
    const lastLogin = t.last_web_login_at
      ? new Date(t.last_web_login_at).toLocaleDateString(I18N.dateLocale())
      : t('tm.never');
    const roleBadge = (t.role === 'admin' || t.role === 'super_admin') ? ' 👑' : '';
    const statusDot = t.status === 'active' ? '🟢' : '⚪';
    return `
      <div class="teacher-row" data-tid="${esc(t.teacher_id)}">
        <div class="teacher-row-info">
          <div class="teacher-row-name">${statusDot} ${esc(t.teacher_name)}${roleBadge}</div>
          <div class="teacher-row-sub">${esc(t.teacher_id)} · ${esc(t.role ? tv('roleName', t.role) : t('inv.roleTeacher'))} · ${t('tm.lastLogin', { date: lastLogin })}</div>
        </div>
        <button class="icon-btn-mini" onclick="resetTeacherPassword('${esc(t.teacher_id)}', '${esc(t.teacher_name)}')" title="${esc(t('tm.resetPassword'))}">🔑</button>
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
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:380px">
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
  const name = document.getElementById('invTName')?.value.trim() || null;
  const role = document.getElementById('invTRole')?.value;
  const btn = document.getElementById('invGenBtn');
  btn.disabled = true;
  btn.textContent = t('inv.generating');

  const result = await createTeacherInvite(role, name);

  btn.disabled = false;
  btn.textContent = t('inv.generate');

  if (!result || !result.ok) {
    showToast(t('inv.failed', { err: result?.message || result?.error || t('common.unknown') }));
    return;
  }

  document.getElementById('invCodeResult').style.display = 'block';
  document.getElementById('invCodeValue').textContent = result.invite_code;
  _loadPastInvites();
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
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:380px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('ct.title')}</h3>
      <p class="modal-subtitle">${t('ct.subtitle')}</p>

      <label class="field-label">${t('ct.teacherId')}</label>
      <input class="form-input" id="newTId" placeholder="${esc(t('ct.teacherIdPh'))}" autocapitalize="off">

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
  `);
};

window.doCreateTeacher = async function() {
  const id    = document.getElementById('newTId')?.value.trim();
  const name  = document.getElementById('newTName')?.value.trim();
  const email = document.getElementById('newTEmail')?.value.trim() || null;
  const role  = document.getElementById('newTRole')?.value;
  const pw    = document.getElementById('newTPw')?.value;
  const errEl = document.getElementById('newTError');
  const btn   = document.getElementById('newTBtn');
  errEl.style.display = 'none';

  if (!id || !name || !pw) {
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
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_admin_create_teacher`, {
      method: 'POST',
      headers: {
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        p_session_token:    sess.session_token,
        p_teacher_id:       id,
        p_teacher_name:     name,
        p_initial_password: pw,
        p_role:             role,
        p_email:            email,
      }),
    });
    const result = await resp.json();
    if (!result || !result.ok) {
      errEl.textContent = (result && result.message) || t('ct.createFailed');
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = t('ct.create');
      return;
    }
    closeModal();
    showToast(t('ct.created'));
    // Reopen the manager to show the new teacher
    setTimeout(() => openTeacherManager(), 200);
  } catch (e) {
    errEl.textContent = t('ct.connErr');
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = t('ct.create');
  }
};

window.resetTeacherPassword = async function(teacherId, teacherName) {
  const newPw = prompt(t('rp.prompt', { name: teacherName, id: teacherId }));
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
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_admin_reset_teacher_password`, {
      method: 'POST',
      headers: {
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        p_session_token: sess.session_token,
        p_teacher_id:    teacherId,
        p_new_password:  newPw,
      }),
    });
    const result = await resp.json();
    if (!result || !result.ok) {
      showToast(t('rp.failed', { err: result?.error || t('common.unknown') }));
      return;
    }
    showToast(t('rp.done', { name: teacherName, pw: newPw }));
  } catch (e) {
    showToast(t('ct.connErr'));
  }
};
