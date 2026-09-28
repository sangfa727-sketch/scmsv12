/**
 * SCMS v11.7 — 19_google_auth.js
 * Google Sign-In (email-based auth) + "Connect Telegram" linking.
 *
 * Architecture:
 *   • Landing screen gets a "Sign in with Google" button (Google Identity
 *     Services / GIS) alongside the existing Telegram + Teacher ID options.
 *   • GIS returns a signed ID token to the browser. We do NOT trust it
 *     ourselves — we POST it to the `google-login` Supabase Edge Function,
 *     which verifies the token server-side (signature/audience/issuer) and
 *     only then calls rpc_google_login with the service_role key.
 *   • Session shape returned is identical to the existing web-session
 *     (session_token, teacher_id, role, ...) so it reuses getWebSession(),
 *     verifyWebSession(), webLogout() etc. from 00_landing.js untouched.
 *   • First-time sign-in with no matching account and no invite code shows
 *     a choice screen: "Register a new school" (becomes admin) or
 *     "I have an invite code" (join existing school as teacher/admin).
 *   • Once logged in (any method), Settings gets a "Connect Telegram" /
 *     "Disconnect Telegram" control using the same deep-link + poll pattern
 *     as the original Telegram login, via rpc_telegram_connect_start/finish.
 */

'use strict';

/* ============================================================================
   GOOGLE SIGN-IN BUTTON (landing screen)
============================================================================ */

let _gisInitialized = false;
let _gisPendingChoice = null; // { id_token } while waiting on invite/new-school choice

function _ensureGisInitialized() {
  if (_gisInitialized) return true;
  if (!window.google?.accounts?.id) return false;
  if (!SCMS_CONFIG.GOOGLE_CLIENT_ID || SCMS_CONFIG.GOOGLE_CLIENT_ID.indexOf('PASTE_') === 0) {
    console.warn('[SCMS] GOOGLE_CLIENT_ID not configured — Google Sign-In disabled.');
    return false;
  }
  window.google.accounts.id.initialize({
    client_id: SCMS_CONFIG.GOOGLE_CLIENT_ID,
    callback: _onGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  _gisInitialized = true;
  return true;
}

/**
 * Renders the official Google button into a container. Call this after
 * renderLanding() has put #googleSignInBtn into the DOM.
 */
window.renderGoogleSignInButton = function (containerId) {
  if (!_ensureGisInitialized()) return;
  const el = document.getElementById(containerId || 'googleSignInBtn');
  if (!el) return;
  try {
    window.google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: 280,
    });
  } catch (e) { /* GIS not ready yet — ignore, button area stays empty */ }
};

async function _onGoogleCredential(response) {
  const idToken = response?.credential;
  if (!idToken) return;
  await _submitGoogleLogin(idToken, {});
}

/**
 * Sends the Google ID token (plus optional invite_code / new_school_name)
 * to the Edge Function, which verifies it and returns a session — or a
 * needs_choice response if this is a brand-new Google account.
 */
async function _submitGoogleLogin(idToken, extra) {
  _setGoogleStatus(t('ga.signingIn'));
  try {
    const resp = await fetch(SCMS_CONFIG.GOOGLE_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_token: idToken,
        device_ua: navigator.userAgent.slice(0, 200),
        invite_code: extra.invite_code || null,
        new_school_name: extra.new_school_name || null,
        teacher_name: extra.teacher_name || null,
      }),
    });
    const result = await resp.json();

    if (result && result.ok) {
      _completeLogin(result, 'google');
      return;
    }

    if (result && result.error === 'no_account' && result.needs_choice) {
      _gisPendingChoice = { id_token: idToken };
      _showGoogleChoiceScreen();
      return;
    }

    _setGoogleStatus(result?.message || t('ga.loginFailed'), true);
  } catch (e) {
    _setGoogleStatus(t('ga.connErr'), true);
  }
}

/**
 * Common "we have a valid session" tail for every auth method (Google,
 * email/password). Saves the session and hands off to the app boot — it
 * does NOT touch any auth-screen DOM, since by this point we're leaving
 * the landing/auth flow entirely.
 *
 * `remember` (default true) controls WHERE the session is cached:
 *   true  → localStorage  (survives closing the browser — "remember me")
 *   false → sessionStorage (cleared when the tab/browser closes)
 * getWebSession()/clearWebSession() in 00_landing.js check both.
 */
function _completeLogin(result, authMode, remember) {
  const webSession = {
    type: 'web',
    auth_mode: authMode,
    session_token: result.session_token,
    teacher_id: result.teacher_id,
    teacher_name: result.teacher_name,
    school_id: result.school_id,
    role: result.role,
    must_change_password: !!result.must_change_password,
    logged_in_at: Date.now(),
  };
  try {
    if (remember === false) {
      sessionStorage.setItem('scms_web_session', JSON.stringify(webSession));
      localStorage.removeItem('scms_web_session');
    } else {
      localStorage.setItem('scms_web_session', JSON.stringify(webSession));
      sessionStorage.removeItem('scms_web_session');
    }
  } catch (e) {}
  if (typeof window.bootAfterLogin === 'function') window.bootAfterLogin();
  else window.location.reload();
}

function _setGoogleStatus(text, isError) {
  // Prefer the current auth-screen's status element; fall back to the
  // landing page's own (used for the initial "Signing in…" state before
  // any screen transition has happened).
  const el = document.getElementById('authScreenStatus') || document.getElementById('googleAuthStatus');
  if (!el) return;
  el.textContent = text || '';
  el.style.display = text ? 'block' : 'none';
  el.className = isError ? 'form-error' : 'login-help-text';
}

/* ============================================================================
   FULL-PAGE AUTH TRANSITIONS
   The landing screen lives inside #bootScreen (see 00_landing.js /
   14_app.js). Rather than stacking a modal on top of it, every subsequent
   auth step (new-account choice, new-school form, invite form, email
   sign-in/sign-up) fades the current content out, swaps it for the next
   screen, and fades back in — reusing the same .fade-out opacity
   transition #bootScreen already uses for the boot→app handoff.
============================================================================ */

function _transitionAuthScreen(html) {
  const boot = document.getElementById('bootScreen');
  if (!boot) return; // shouldn't happen — landing always lives inside #bootScreen
  boot.classList.add('fade-out');
  setTimeout(() => {
    boot.innerHTML = html;
    boot.classList.remove('fade-out');
  }, 350);
}

window._backToLanding = function () {
  window.location.reload();
};

function _authScreenShell(titleHtml, subtitleText, bodyHtml) {
  return `
    <div class="boot-inner" style="width:100%; max-width:380px; text-align:left; padding:0 24px;">
      <div class="boot-logo" style="justify-content:flex-start; margin-bottom:24px;">
        <span class="boot-logo-mark">S</span>
        <span class="boot-logo-text">CMS</span>
      </div>
      <h2 style="margin:0 0 4px;">${titleHtml}</h2>
      <p class="login-help-text" style="margin:0 0 20px;">${subtitleText}</p>
      ${bodyHtml}
    </div>`;
}

/**
 * A password <input> wrapped with a show/hide eye-icon toggle button.
 */
function _pwFieldHtml(id, placeholder, autocomplete, extraAttrs) {
  return `
    <div class="pw-field-wrap">
      <input class="form-input" id="${id}" type="password" placeholder="${placeholder}" autocomplete="${autocomplete}" ${extraAttrs || ''}>
      <button type="button" class="pw-toggle-btn" onclick="togglePwVisibility('${id}', this)" aria-label="${esc(t('ga.showPassword'))}">👁️</button>
    </div>`;
}

window.togglePwVisibility = function (id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
};

/* ── Google: new-account choice (new school vs invite code) ──────────────── */

function _showGoogleChoiceScreen() {
  _transitionAuthScreen(_authScreenShell(
    t('ga.welcome'),
    t('ga.noAccount'),
    `
      <button class="landing-btn-ghost" onclick="showGoogleNewSchoolForm()">
        <span class="landing-btn-icon">🏫</span>
        <div class="landing-btn-text">
          <div class="landing-btn-title">${t('ga.startSchool')}</div>
          <div class="landing-btn-sub">${t('ga.startSchoolSub')}</div>
        </div>
      </button>
      <button class="landing-btn-ghost mt8" onclick="showGoogleInviteForm()">
        <span class="landing-btn-icon">✉️</span>
        <div class="landing-btn-text">
          <div class="landing-btn-title">${t('ga.haveInvite')}</div>
          <div class="landing-btn-sub">${t('ga.haveInviteSub')}</div>
        </div>
      </button>

      <div id="authScreenForm"></div>
      <div id="authScreenStatus" class="form-error" style="display:none"></div>

      <button class="btn-secondary mt16" onclick="_backToLanding()">${t('ga.back')}</button>
    `
  ));
}

window.showGoogleNewSchoolForm = function () {
  const form = document.getElementById('authScreenForm');
  if (!form) return;
  form.innerHTML = `
    <label class="field-label">${t('ga.yourName')}</label>
    <input class="form-input" id="gNewTeacherName" type="text" placeholder="${esc(t('ga.namePh'))}">
    <label class="field-label">${t('ga.schoolName')}</label>
    <input class="form-input" id="gNewSchoolName" type="text" placeholder="${esc(t('ga.schoolNamePh'))}">
    <button class="btn-primary mt16" onclick="submitGoogleNewSchool()">${t('ga.startSchoolBtn')}</button>
  `;
};

window.submitGoogleNewSchool = async function () {
  if (!_gisPendingChoice) return;
  const name = document.getElementById('gNewTeacherName')?.value.trim();
  const school = document.getElementById('gNewSchoolName')?.value.trim();
  if (!school) { _setGoogleStatus(t('ga.enterSchoolName'), true); return; }
  await _submitGoogleLogin(_gisPendingChoice.id_token, {
    new_school_name: school,
    teacher_name: name || null,
  });
};

window.showGoogleInviteForm = function () {
  const form = document.getElementById('authScreenForm');
  if (!form) return;
  form.innerHTML = `
    <label class="field-label">${t('ga.yourName')}</label>
    <input class="form-input" id="gInviteTeacherName" type="text" placeholder="${esc(t('ga.namePh'))}">
    <label class="field-label">${t('ga.inviteCode')}</label>
    <input class="form-input" id="gInviteCode" type="text" placeholder="${esc(t('ga.inviteCodePh'))}"
           autocapitalize="characters" style="text-transform:uppercase">
    <button class="btn-primary mt16" onclick="submitGoogleInvite()">${t('ga.join')}</button>
  `;
};

window.submitGoogleInvite = async function () {
  if (!_gisPendingChoice) return;
  const name = document.getElementById('gInviteTeacherName')?.value.trim();
  const code = document.getElementById('gInviteCode')?.value.trim().toUpperCase();
  if (!code) { _setGoogleStatus(t('ga.enterInviteCode'), true); return; }
  await _submitGoogleLogin(_gisPendingChoice.id_token, {
    invite_code: code,
    teacher_name: name || null,
  });
};

/* ── Email + password: sign in ─────────────────────────────────────────── */

window.showEmailSignInScreen = function () {
  _transitionAuthScreen(_authScreenShell(
    t('ga.emailSignIn'),
    t('ga.emailSignInSub'),
    `
      <label class="field-label">${t('ga.email')}</label>
      <input class="form-input" id="emailLoginEmail" type="email" placeholder="you@example.com" autocomplete="username">
      <label class="field-label">${t('ga.password')}</label>
      ${_pwFieldHtml('emailLoginPw', '••••••••', 'current-password', 'onkeydown="if(event.key===\'Enter\')submitEmailLogin()"')}

      <label class="remember-me-row">
        <input type="checkbox" id="emailLoginRemember" checked>
        <span>${t('ga.rememberMe')}</span>
      </label>

      <button class="btn-primary mt16" onclick="submitEmailLogin()">${t('ga.signIn')}</button>
      <div id="authScreenStatus" class="form-error" style="display:none"></div>

      <p class="login-help-text mt16">${t('ga.noAccountQ')} <a href="#" onclick="showEmailSignUpScreen(); return false;">${t('ga.signUp')}</a></p>
      <button class="btn-secondary mt8" onclick="_backToLanding()">${t('ga.back')}</button>
    `
  ));
};

window.submitEmailLogin = async function () {
  const email = document.getElementById('emailLoginEmail')?.value.trim();
  const pw = document.getElementById('emailLoginPw')?.value;
  const remember = document.getElementById('emailLoginRemember')?.checked !== false;
  if (!email || !pw) { _setGoogleStatus(t('ga.enterEmailPw'), true); return; }
  _setGoogleStatus(t('ga.signingIn'));
  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_email_login`, {
      method: 'POST',
      headers: {
        'apikey': SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_email: email, p_password: pw, p_device_ua: navigator.userAgent.slice(0, 200) }),
    });
    const result = await resp.json();
    if (result && result.ok) { _completeLogin(result, 'email', remember); return; }
    _setGoogleStatus(result?.message || t('ga.loginFailed'), true);
  } catch (e) {
    _setGoogleStatus('Connection error', true);
  }
};

/* ── Email + password: sign up ─────────────────────────────────────────── */

let _emailSignupChoice = null; // 'new' | 'invite'

window.showEmailSignUpScreen = function () {
  _emailSignupChoice = null;
  _transitionAuthScreen(_authScreenShell(
    t('ga.createAccount'),
    t('ga.createAccountSub'),
    `
      <label class="field-label">${t('ga.yourName')}</label>
      <input class="form-input" id="emailSignupName" type="text" placeholder="${esc(t('ga.namePh'))}">
      <label class="field-label">${t('ga.email')}</label>
      <input class="form-input" id="emailSignupEmail" type="email" placeholder="you@example.com" autocomplete="username">
      <label class="field-label">${t('ga.password')}</label>
      ${_pwFieldHtml('emailSignupPw', t('ga.atLeast6'), 'new-password')}

      <div class="landing-divider mt16"><span>${t('ga.whatToDo')}</span></div>

      <button class="landing-btn-ghost" id="tabNewSchool" onclick="_signupChoiceTab('new')">
        <span class="landing-btn-icon">🏫</span>
        <div class="landing-btn-text">
          <div class="landing-btn-title">${t('ga.startSchool')}</div>
        </div>
      </button>
      <button class="landing-btn-ghost mt8" id="tabInvite" onclick="_signupChoiceTab('invite')">
        <span class="landing-btn-icon">✉️</span>
        <div class="landing-btn-text">
          <div class="landing-btn-title">${t('ga.haveInvite')}</div>
        </div>
      </button>

      <div id="signupExtraField" class="mt8"></div>

      <button class="btn-primary mt16" id="emailSignupBtn" onclick="submitEmailSignup()" disabled>${t('ga.chooseToContinue')}</button>
      <div id="authScreenStatus" class="form-error" style="display:none"></div>

      <p class="login-help-text mt16">${t('ga.haveAccountQ')} <a href="#" onclick="showEmailSignInScreen(); return false;">${t('ga.signIn')}</a></p>
      <button class="btn-secondary mt8" onclick="_backToLanding()">${t('ga.back')}</button>
    `
  ));
};

window._signupChoiceTab = function (which) {
  _emailSignupChoice = which;
  const extra = document.getElementById('signupExtraField');
  const btn = document.getElementById('emailSignupBtn');
  if (!extra || !btn) return;
  if (which === 'new') {
    extra.innerHTML = `
      <label class="field-label">${t('ga.schoolName')}</label>
      <input class="form-input" id="signupSchoolName" type="text" placeholder="${esc(t('ga.schoolNamePh'))}">`;
    btn.textContent = t('ga.startSchoolBtn');
  } else {
    extra.innerHTML = `
      <label class="field-label">${t('ga.inviteCode')}</label>
      <input class="form-input" id="signupInviteCode" type="text" placeholder="${esc(t('ga.inviteCodePh'))}"
             autocapitalize="characters" style="text-transform:uppercase">`;
    btn.textContent = t('ga.join');
  }
  btn.disabled = false;
};

window.submitEmailSignup = async function () {
  const name = document.getElementById('emailSignupName')?.value.trim();
  const email = document.getElementById('emailSignupEmail')?.value.trim();
  const pw = document.getElementById('emailSignupPw')?.value;
  if (!name) { _setGoogleStatus(t('ga.enterName'), true); return; }
  if (!email) { _setGoogleStatus(t('ga.enterEmail'), true); return; }
  if (!pw || pw.length < 6) { _setGoogleStatus(t('ga.pwAtLeast6'), true); return; }

  const payload = {
    p_email: email, p_password: pw, p_teacher_name: name,
    p_device_ua: navigator.userAgent.slice(0, 200),
    p_invite_code: null, p_new_school_name: null,
  };
  if (_emailSignupChoice === 'new') {
    const school = document.getElementById('signupSchoolName')?.value.trim();
    if (!school) { _setGoogleStatus(t('ga.enterSchoolName'), true); return; }
    payload.p_new_school_name = school;
  } else if (_emailSignupChoice === 'invite') {
    const code = document.getElementById('signupInviteCode')?.value.trim().toUpperCase();
    if (!code) { _setGoogleStatus(t('ga.enterInviteCode'), true); return; }
    payload.p_invite_code = code;
  } else {
    _setGoogleStatus(t('ga.chooseSchoolOrInvite'), true);
    return;
  }

  _setGoogleStatus(t('ga.creatingAccount'));
  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_email_signup`, {
      method: 'POST',
      headers: {
        'apikey': SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (result && result.ok) { _completeLogin(result, 'email'); return; }
    _setGoogleStatus(result?.message || t('ga.signupFailed'), true);
  } catch (e) {
    _setGoogleStatus('Connection error', true);
  }
};

/* ============================================================================
   TELEGRAM-CONNECT (Settings — for users who logged in via Google/password)
   Same deep-link + poll pattern as the original Telegram login in
   00_landing.js, but hitting rpc_telegram_connect_start/finish instead of
   directly reading/writing app_sessions, and attaching to the CURRENT
   logged-in teacher rather than creating a new session.
============================================================================ */

let _tgConnectTimer = null;
let _tgConnectToken = null;

window.openTelegramConnectModal = function () {
  const sess = (typeof getWebSession === 'function') ? getWebSession() : null;
  if (!sess || !sess.session_token) return;

  const wrap = document.createElement('div');
  wrap.id = 'tgConnectModal';
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:380px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('tg.connectTitle')}</h3>
      <p class="modal-subtitle">${t('tg.connectSub')}</p>

      <div id="tgConnectStatus" class="login-help-text">${t('tg.waitingStart')}</div>

      <button class="btn-primary mt16" id="tgConnectOpenBtn" onclick="startTelegramConnect()">
        ${t('tg.openTelegram')}
      </button>
      <button class="btn-secondary" onclick="closeTelegramConnectModal()">${t('common.cancel')}</button>
    </div>`;
  wrap.onclick = closeTelegramConnectModal;
  document.body.appendChild(wrap);
  wrap.classList.add('active');
};

window.closeTelegramConnectModal = function () {
  _stopTelegramConnectPolling();
  document.getElementById('tgConnectModal')?.remove();
};

window.startTelegramConnect = async function () {
  const sess = getWebSession();
  if (!sess || !sess.session_token) return;

  const statusEl = document.getElementById('tgConnectStatus');
  const btn = document.getElementById('tgConnectOpenBtn');
  if (btn) { btn.disabled = true; btn.textContent = t('boot.openingTg'); }

  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_telegram_connect_start`, {
      method: 'POST',
      headers: {
        'apikey': SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_session_token: sess.session_token }),
    });
    const result = await resp.json();
    if (!result || !result.ok) {
      if (statusEl) statusEl.textContent = result?.message || t('tg.connectFailed');
      if (btn) { btn.disabled = false; btn.textContent = t('tg.openTelegram'); }
      return;
    }

    _tgConnectToken = result.connect_token;
    const bot = SCMS_CONFIG.BOT_USERNAME || 'VavidaISBbot';
    const url = `https://t.me/${bot}?start=connect_${encodeURIComponent(_tgConnectToken)}`;

    if (typeof _openTelegram === 'function') _openTelegram(url);
    else window.open(url, '_blank', 'noopener');

    if (statusEl) statusEl.textContent = t('tg.waitingTap');
    if (btn) btn.textContent = t('tg.reopen');
    if (btn) btn.disabled = false;

    _startTelegramConnectPolling(sess.session_token, _tgConnectToken);
  } catch (e) {
    if (statusEl) statusEl.textContent = t('ct.connErr');
    if (btn) { btn.disabled = false; btn.textContent = t('tg.openTelegram'); }
  }
};

function _startTelegramConnectPolling(sessionToken, connectToken) {
  _stopTelegramConnectPolling();
  let attempts = 0;
  _tgConnectTimer = setInterval(async () => {
    attempts++;
    if (attempts > 150) { // ~5 min at 2s
      _stopTelegramConnectPolling();
      const statusEl = document.getElementById('tgConnectStatus');
      if (statusEl) statusEl.textContent = t('tg.timedOut');
      return;
    }
    try {
      const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_telegram_connect_finish`, {
        method: 'POST',
        headers: {
          'apikey': SCMS_CONFIG.SUPABASE_ANON,
          'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_session_token: sessionToken, p_connect_token: connectToken }),
      });
      const result = await resp.json();
      if (result && result.ok) {
        _stopTelegramConnectPolling();
        if (window.APP) window.APP.telegram_id = result.telegram_id;
        showToast?.(t('tg.connected'));
        closeTelegramConnectModal();
        if (typeof window.openSettings === 'function') window.openSettings();
      } else if (result && result.error && result.error !== 'not_linked_yet') {
        _stopTelegramConnectPolling();
        const statusEl = document.getElementById('tgConnectStatus');
        if (statusEl) statusEl.textContent = result.message || t('tg.connectFailed');
      }
      // 'not_linked_yet' → keep polling silently
    } catch (e) { /* keep polling */ }
  }, 2000);
}

function _stopTelegramConnectPolling() {
  if (_tgConnectTimer) { clearInterval(_tgConnectTimer); _tgConnectTimer = null; }
  _tgConnectToken = null;
}

window.disconnectTelegram = function () {
  const sess = getWebSession();
  if (!sess || !sess.session_token) return;

  const wrap = document.createElement('div');
  wrap.id = 'tgDisconnectConfirmModal';
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:360px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('tg.disconnectTitle')}</h3>
      <p class="modal-subtitle">${t('tg.disconnectSub')}</p>

      <button class="btn-danger solid mt16" onclick="_doDisconnectTelegramConfirmed()">${t('tg.disconnect')}</button>
      <button class="btn-secondary mt8" onclick="_closeTgDisconnectConfirm()">${t('common.cancel')}</button>
    </div>`;
  wrap.onclick = _closeTgDisconnectConfirm;
  document.body.appendChild(wrap);
  wrap.classList.add('active');
};

window._closeTgDisconnectConfirm = function () {
  document.getElementById('tgDisconnectConfirmModal')?.remove();
};

window._doDisconnectTelegramConfirmed = async function () {
  _closeTgDisconnectConfirm();
  const sess = getWebSession();
  if (!sess || !sess.session_token) return;

  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_telegram_disconnect`, {
      method: 'POST',
      headers: {
        'apikey': SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_session_token: sess.session_token }),
    });
    const result = await resp.json();
    if (result && result.ok) {
      if (window.APP) window.APP.telegram_id = null;
      showToast?.(t('tg.disconnected'));
      if (typeof window.openSettings === 'function') window.openSettings();
    }
  } catch (e) { /* best effort */ }
};

/* ============================================================================
   ADMIN — INVITE MANAGEMENT (Settings → Manage Teachers)
============================================================================ */

window.createTeacherInvite = async function (role, teacherName) {
  const sess = getWebSession();
  if (!sess || !sess.session_token) return null;

  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_admin_create_invite`, {
      method: 'POST',
      headers: {
        'apikey': SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_session_token: sess.session_token,
        p_role: role || 'teacher',
        p_teacher_name: teacherName || null,
      }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: 'connection_error' };
  }
};

window.listTeacherInvites = async function () {
  const sess = getWebSession();
  if (!sess || !sess.session_token) return { ok: false, invites: [] };

  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_admin_list_invites`, {
      method: 'POST',
      headers: {
        'apikey': SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_session_token: sess.session_token }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, invites: [] };
  }
};
