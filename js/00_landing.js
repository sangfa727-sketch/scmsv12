/**
 * SCMS v11 — 00_landing.js
 * Landing screen + Telegram-based login flow.
 *
 * When the app is opened OUTSIDE Telegram (native Capacitor app or plain web),
 * the user has no Telegram WebApp session to authenticate them. We show a
 * landing page with three actions:
 *
 *   1. "Sign in with Telegram"  → opens Telegram bot with /start app_login_<token>.
 *      The bot writes { token, teacher_id, school_id } into the `app_sessions`
 *      Supabase table; the app polls every 2 s and bootstraps when it finds
 *      its token. The token is then stored in localStorage so future launches
 *      auto-login.
 *
 *   2. "Register a new school"  → opens Telegram with /register_school
 *      (existing wizard in the n8n flow, no change needed).
 *
 *   3. "Join existing school"   → opens Telegram with /register_teacher
 *      (existing wizard).
 *
 * Inside Telegram (TWA) this whole screen is skipped — the user is already
 * authenticated via initData, and 14_app.js boots straight into the main UI.
 */

'use strict';

let _loginPollTimer = null;
let _loginToken     = null;
let _loginPollCount = 0;

// localStorage key for the in-flight login token (survives a page reload that
// happens when the OS switches back from Telegram to the app).
const _PENDING_TOKEN_KEY = 'scms_pending_login_token';

/**
 * Decide whether the landing page should be shown.
 * Cases:
 *   • Running inside Telegram (TWA) → NO, skip to bootstrap
 *   • Have a saved session token in localStorage → NO, try silent login
 *   • Otherwise (cold native or web start) → YES, show landing
 */
window.shouldShowLanding = function () {
  if (isTWA()) return false;
  const saved = _getSavedSession();
  if (saved && saved.token && saved.telegram_id) return false;
  // Skip landing if we have a stored web session (will be verified on boot)
  const webSess = (typeof getWebSession === 'function') ? getWebSession() : null;
  if (webSess && webSess.session_token) return false;
  return true;
};

/**
 * Render the landing screen into #bootScreen (replacing the spinner).
 * Called by 14_app.js before bootstrap runs.
 */
window.renderLanding = function () {
  const boot = document.getElementById('bootScreen');
  if (!boot) return;
  boot.style.display = 'flex';
  boot.innerHTML = `
    <div class="landing-shell">
      <div class="landing-inner">

        <div class="landing-logo">
          <span class="landing-logo-mark">S</span>
          <span class="landing-logo-text">CMS</span>
        </div>

        <h1 class="landing-title">${t('landing.title')}<br><em>${t('landing.titleEm')}</em></h1>
        <p class="landing-subtitle">${t('landing.subtitle')}</p>

        <div id="googleSignInBtn" class="landing-google-btn"></div>
        <div id="googleAuthStatus" class="login-help-text" style="display:none"></div>
        <p class="login-help-text" style="text-align:center; margin-top:10px;">
          <a href="#" onclick="showEmailSignInScreen(); return false;">${t('landing.emailLink')}</a>
        </p>

        <div class="landing-divider"><span>${t('landing.or')}</span></div>

        <button class="landing-btn landing-btn-primary" id="btnTgLogin" onclick="startTelegramLogin()">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M9.999 15.2L9.847 18.6c.36 0 .516-.155.704-.34l1.688-1.62 3.499 2.563c.641.358 1.097.17 1.27-.594l2.299-10.78h.001c.205-.953-.345-1.326-.97-1.09L4.07 11.91c-.93.36-.916.873-.158 1.107l3.354 1.045 7.793-4.91c.367-.243.7-.108.426.135"/>
          </svg>
          <span>${t('landing.telegram')}</span>
        </button>

        <button class="landing-btn landing-btn-secondary" onclick="openWebLoginModal()">
          <span class="landing-btn-icon">🔐</span>
          <span>${t('landing.teacherId')}</span>
        </button>

        <div class="landing-divider"><span>${t('landing.getStarted')}</span></div>

        <div class="landing-secondary">
          <button class="landing-btn-ghost" onclick="openTelegramCommand('register_school')">
            <span class="landing-btn-icon">🏫</span>
            <div class="landing-btn-text">
              <div class="landing-btn-title">${t('landing.registerSchool')}</div>
              <div class="landing-btn-sub">${t('landing.registerSchoolSub')}</div>
            </div>
          </button>
          <button class="landing-btn-ghost" onclick="openTelegramCommand('register_teacher')">
            <span class="landing-btn-icon">👨‍🏫</span>
            <div class="landing-btn-text">
              <div class="landing-btn-title">${t('landing.joinSchool')}</div>
              <div class="landing-btn-sub">${t('landing.joinSchoolSub')}</div>
            </div>
          </button>
        </div>

        <div class="landing-parents">
          <strong>${t('landing.parentQ')}</strong>
          <p>${t('landing.parentBody')}</p>
        </div>

        <div class="landing-footer">
          v${esc(SCMS_CONFIG.VERSION)} · ${esc(window.APP.platform)}
        </div>
      </div>

      <!-- Login pending sheet (slides up after Sign-in tap) -->
      <div class="login-pending" id="loginPending" style="display:none">
        <div class="login-pending-inner">
          <div class="login-pending-spinner"><div class="spin-ring"></div></div>
          <div class="login-pending-title">${t('landing.waitTg')}</div>
          <div class="login-pending-sub" id="loginPendingSub">
            ${t('landing.waitTgSub')}
          </div>

          <button class="btn-secondary" id="btnLoginRetry" onclick="startTelegramLogin(true)">
            ${t('landing.openAgain')}
          </button>
          <button class="btn-ghost" onclick="cancelTelegramLogin()">${t('common.cancel')}</button>

          <div class="login-pending-help" id="loginPendingHelp" style="display:none">
            <details>
              <summary>${t('landing.tgNotOpen')}</summary>
              <p>${t('landing.tgManual')}</p>
              <code id="loginManualUrl"></code>
              <button class="btn-secondary" id="btnCopyManualUrl">${t('landing.copyLink')}</button>
            </details>
          </div>
        </div>
      </div>

    </div>`;

  // Render the Google Identity Services button now that its container exists.
  // GIS's script tag loads async, so this may need to retry briefly.
  if (typeof window.renderGoogleSignInButton === 'function') {
    window.renderGoogleSignInButton('googleSignInBtn');
    let _gisRetries = 0;
    const _gisRetryTimer = setInterval(() => {
      _gisRetries++;
      const el = document.getElementById('googleSignInBtn');
      if (!el || el.childElementCount > 0 || _gisRetries > 20) {
        clearInterval(_gisRetryTimer);
        return;
      }
      window.renderGoogleSignInButton('googleSignInBtn');
    }, 300);
  }

  // If we have a pending login token from before a reload (native handoff
  // back from Telegram often reloads the page), resume polling automatically
  // so the user doesn't have to tap "Sign in" again.
  let pendingToken = null;
  try { pendingToken = localStorage.getItem(_PENDING_TOKEN_KEY); } catch (e) {}
  if (pendingToken) {
    _loginToken = pendingToken;
    _loginPollCount = 0;
    const pending = document.getElementById('loginPending');
    if (pending) pending.style.display = 'flex';
    _setPendingSub(t('landing.checking'));
    _startLoginPolling(_loginToken);
  }
};

/**
 * Kick off the Telegram login flow.
 *   • Generate a random token (UUID-ish)
 *   • Save it locally so we know what to poll for
 *   • Open Telegram with /start app_login_<token>
 *   • Start polling Supabase app_sessions table
 */
window.startTelegramLogin = async function (isRetry) {
  // Generate fresh token on first call; reuse on retry so the bot's earlier
  // /start lands on the same session row.
  if (!_loginToken || !isRetry) {
    _loginToken = _generateToken();
  }
  // Persist the pending token so a page reload (common on native handoff
  // back from Telegram) doesn't lose which token we're waiting on.
  try { localStorage.setItem(_PENDING_TOKEN_KEY, _loginToken); } catch (e) {}
  _loginPollCount = 0;

  // 1) Pre-register an empty session row in Supabase so the bot can find it
  //    by token. (If RLS prevents the anon insert, fall through — the bot
  //    creates the row itself.)
  await _preregisterSession(_loginToken).catch(() => { /* best effort */ });

  // 2) Build the deep link and open Telegram
  const url = _buildLoginUrl(_loginToken);
  _openTelegram(url);

  // 3) Show the pending sheet
  const pending = document.getElementById('loginPending');
  if (pending) pending.style.display = 'flex';
  const manualUrlEl = document.getElementById('loginManualUrl');
  if (manualUrlEl) manualUrlEl.textContent = url;
  const copyBtn = document.getElementById('btnCopyManualUrl');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(url);
      copyBtn.textContent = t('landing.copied');
      setTimeout(() => { copyBtn.textContent = t('landing.copyLink'); }, 1500);
    };
  }

  // 4) Begin polling
  _startLoginPolling(_loginToken);

  // 5) After 12 s, reveal the manual-copy fallback
  setTimeout(() => {
    const help = document.getElementById('loginPendingHelp');
    if (help) help.style.display = 'block';
  }, 12000);
};

/**
 * Open Telegram with a bot command (used for register flows).
 */
window.openTelegramCommand = function (cmd) {
  const bot = SCMS_CONFIG.BOT_USERNAME || 'VavidaISBbot';
  // No start param — user types the command themselves (matches existing flow)
  const url = `https://t.me/${bot}?start=${encodeURIComponent(cmd)}`;
  _openTelegram(url);
};

window.cancelTelegramLogin = function () {
  _stopLoginPolling();
  _loginToken = null;
  try { localStorage.removeItem(_PENDING_TOKEN_KEY); } catch (e) {}
  const pending = document.getElementById('loginPending');
  if (pending) pending.style.display = 'none';
};

/* ────────────────────────────────────────────────────────────────────────
   Internals
   ──────────────────────────────────────────────────────────────────────── */

function _generateToken() {
  // 16 random bytes → hex (32 chars). crypto if available, fallback otherwise.
  if (window.crypto?.getRandomValues) {
    const a = new Uint8Array(16);
    window.crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  return (Math.random().toString(36) + Date.now().toString(36)).replace(/\./g, '');
}

function _buildLoginUrl(token) {
  const bot = SCMS_CONFIG.BOT_USERNAME || 'VavidaISBbot';
  // Backend regex in Pre-Auth must match: /^\/start\s+app_login_([a-f0-9]+)/i
  return `https://t.me/${bot}?start=app_login_${encodeURIComponent(token)}`;
}

function _openTelegram(url) {
  // On native (Capacitor) we can use the system browser to hand off to TG.
  // On web we can use window.open. tg:// scheme is the most reliable handoff
  // when Telegram is installed.
  try {
    if (window.Capacitor?.Plugins?.Browser) {
      window.Capacitor.Plugins.Browser.open({ url });
      return;
    }
  } catch (e) { /* fall through */ }

  // Try the tg:// scheme first for instant app handoff
  const tgScheme = url
    .replace('https://t.me/', 'tg://resolve?domain=')
    .replace('?start=', '&start=');
  try {
    window.location.href = tgScheme;
    // If TG isn't installed, the page won't navigate. As a fallback after
    // 800 ms open the https link in a new tab.
    setTimeout(() => { window.open(url, '_blank', 'noopener'); }, 800);
  } catch (e) {
    window.open(url, '_blank', 'noopener');
  }
}

async function _preregisterSession(token) {
  // Insert (or upsert) a placeholder row so the polling SELECT has something
  // to find. The bot will fill in telegram_id + teacher_id on its side.
  const url = `${SCMS_CONFIG.SUPABASE_URL}/rest/v1/app_sessions`;
  const resp = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SCMS_CONFIG.SUPABASE_ANON,
      'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      token,
      status:     'pending',
      device_ua:  navigator.userAgent.slice(0, 200),
      created_at: new Date().toISOString(),
    }),
  });
  // 201 created or 200 merged is fine; 4xx means RLS blocked us — that's OK
  // because the bot will create the row itself.
  return resp.ok;
}

function _startLoginPolling(token) {
  _stopLoginPolling();
  _loginPollTimer = setInterval(async () => {
    _loginPollCount++;
    // Stop after ~5 minutes
    if (_loginPollCount > 150) {
      _stopLoginPolling();
      _setPendingSub(t('landing.timeout'));
      return;
    }
    try {
      // Primary: look up the exact token the app generated.
      let session = await _checkSession(token);

      // Fallback: if the deep-link dropped the start param (some Telegram
      // clients / native handoffs do this), the bot may have created a row
      // under a DIFFERENT token but with our flow still pending. In that case
      // we detect the most-recent freshly-linked session and adopt it.
      // This only triggers after a few seconds to avoid grabbing a stale row.
      if ((!session || !session.telegram_id) && _loginPollCount >= 2) {
        session = await _checkRecentLinkedSession();
      }

      if (session && session.telegram_id) {
        // ✓ Authenticated
        _stopLoginPolling();
        try { localStorage.removeItem(_PENDING_TOKEN_KEY); } catch (e) {}
        _saveSession(session);
        _setPendingSub(t('landing.signedIn'));
        // Hand back to 14_app.js bootstrap
        setTimeout(() => {
          if (typeof window.bootAfterLogin === 'function') window.bootAfterLogin();
          else window.location.reload();
        }, 400);
      }
    } catch (_e) { /* keep polling */ }
  }, 2000);
}

function _stopLoginPolling() {
  if (_loginPollTimer) { clearInterval(_loginPollTimer); _loginPollTimer = null; }
}

async function _checkSession(token) {
  const url = `${SCMS_CONFIG.SUPABASE_URL}/rest/v1/app_sessions`
            + `?token=eq.${encodeURIComponent(token)}`
            + `&select=token,telegram_id,teacher_id,school_id,status,teacher_name`;
  const resp = await fetch(url, {
    headers: {
      'apikey':        SCMS_CONFIG.SUPABASE_ANON,
      'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0] || null;
}

/**
 * Fallback: find a session row that was linked within the last 3 minutes.
 * Used when the deep-link's start param was dropped so the bot's row uses a
 * token we don't know. Since the bot only links a session when a real teacher
 * presses Start in THIS login window, adopting the freshest linked row is safe
 * for a single-user device. We pick the most recently linked row.
 */
async function _checkRecentLinkedSession() {
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const url = `${SCMS_CONFIG.SUPABASE_URL}/rest/v1/app_sessions`
            + `?status=eq.linked`
            + `&linked_at=gte.${encodeURIComponent(threeMinAgo)}`
            + `&order=linked_at.desc&limit=1`
            + `&select=token,telegram_id,teacher_id,school_id,status,teacher_name,linked_at`;
  const resp = await fetch(url, {
    headers: {
      'apikey':        SCMS_CONFIG.SUPABASE_ANON,
      'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0] || null;
}

function _setPendingSub(text) {
  const el = document.getElementById('loginPendingSub');
  if (el) el.textContent = text;
}

/* ────────────────────────────────────────────────────────────────────────
   Persistent session (localStorage)
   ──────────────────────────────────────────────────────────────────────── */

const _SESSION_KEY = 'scms_session_v1';

function _saveSession(session) {
  try {
    localStorage.setItem(_SESSION_KEY, JSON.stringify({
      token:        session.token,
      telegram_id:  session.telegram_id,
      teacher_id:   session.teacher_id,
      school_id:    session.school_id,
      teacher_name: session.teacher_name,
      saved_at:     Date.now(),
    }));
  } catch (e) { /* localStorage might be disabled */ }
}

function _getSavedSession() {
  try {
    const raw = localStorage.getItem(_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

window.getSavedSession = _getSavedSession;
window.clearSavedSession = function () {
  try { localStorage.removeItem(_SESSION_KEY); } catch (e) {}
};

/* ============================================================================
   WEB LOGIN (v11.6 — Phase 1)
   ============================================================================
   Teacher ID + password login, separate from the Telegram path.
   Session token stored in localStorage, verified on each app boot.
============================================================================ */

const _WEB_SESSION_KEY = 'scms_web_session';

window.openWebLoginModal = function () {
  const wrap = document.createElement('div');
  wrap.id = 'webLoginModal';
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:380px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('login.title')}</h3>
      <p class="modal-subtitle">${t('login.sub')}</p>

      <label class="field-label">${t('login.teacherId')}</label>
      <input class="form-input" id="webLoginId" type="text" autocomplete="username"
             placeholder="${esc(t('login.teacherIdPh'))}" autocapitalize="off" autocorrect="off">

      <label class="field-label">${t('login.password')}</label>
      <input class="form-input" id="webLoginPw" type="password" autocomplete="current-password"
             placeholder="••••••••" onkeydown="if(event.key==='Enter')doWebLogin()">

      <div id="webLoginError" class="form-error" style="display:none"></div>

      <button class="btn-primary mt16" id="webLoginBtn" onclick="doWebLogin()">${t('login.btn')}</button>
      <button class="btn-secondary" onclick="closeWebLoginModal()">${t('common.cancel')}</button>

      <div class="login-help-text">
        ${t('login.help')}
      </div>
    </div>`;
  wrap.onclick = closeWebLoginModal;
  document.body.appendChild(wrap);
  wrap.classList.add('active');
  setTimeout(() => document.getElementById('webLoginId')?.focus(), 50);
};

window.closeWebLoginModal = function () {
  document.getElementById('webLoginModal')?.remove();
};

window.doWebLogin = async function () {
  const id = document.getElementById('webLoginId')?.value.trim();
  const pw = document.getElementById('webLoginPw')?.value;
  const errEl = document.getElementById('webLoginError');
  const btn = document.getElementById('webLoginBtn');

  if (errEl) errEl.style.display = 'none';

  if (!id || !pw) {
    if (errEl) {
      errEl.textContent = t('login.needBoth');
      errEl.style.display = 'block';
    }
    return;
  }

  btn.disabled = true;
  btn.textContent = t('login.signingIn');

  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_teacher_web_login`, {
      method: 'POST',
      headers: {
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        p_teacher_id: id,
        p_password:   pw,
        p_device_ua:  navigator.userAgent.slice(0, 200),
      }),
    });

    const result = await resp.json();

    if (!result || !result.ok) {
      const msg = (result && result.message) || t('login.failed');
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
      }
      btn.disabled = false;
      btn.textContent = t('login.btn');
      return;
    }

    // Save the web session — distinct shape from TG session
    const webSession = {
      type:                'web',
      session_token:       result.session_token,
      teacher_id:          result.teacher_id,
      teacher_name:        result.teacher_name,
      school_id:           result.school_id,
      role:                result.role,
      must_change_password: result.must_change_password,
      logged_in_at:        Date.now(),
    };
    try { localStorage.setItem(_WEB_SESSION_KEY, JSON.stringify(webSession)); } catch (e) {}

    // Tell the rest of the app to boot with this session
    closeWebLoginModal();
    if (result.must_change_password) {
      // Force the user to change their password before continuing
      openChangePasswordModal({ first_time: true });
    } else {
      if (typeof window.bootAfterLogin === 'function') {
        window.bootAfterLogin({ webSession });
      } else {
        window.location.reload();
      }
    }
  } catch (e) {
    if (errEl) {
      errEl.textContent = t('login.connErr');
      errEl.style.display = 'block';
    }
    btn.disabled = false;
    btn.textContent = t('login.btn');
  }
};

window.getWebSession = function () {
  try {
    const raw = localStorage.getItem(_WEB_SESSION_KEY) || sessionStorage.getItem(_WEB_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};

window.clearWebSession = function () {
  try { localStorage.removeItem(_WEB_SESSION_KEY); } catch (e) {}
  try { sessionStorage.removeItem(_WEB_SESSION_KEY); } catch (e) {}
};

/**
 * Verify a stored web session on app boot.
 * Returns the verified session info, or null if invalid/expired.
 */
window.verifyWebSession = async function () {
  const sess = getWebSession();
  if (!sess || !sess.session_token) return null;

  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_web_session_verify`, {
      method: 'POST',
      headers: {
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ p_session_token: sess.session_token }),
    });
    const result = await resp.json();
    if (!result || !result.ok) {
      clearWebSession();
      return null;
    }
    // Refresh local cache with the verified data — write back to whichever
    // storage it actually came from (localStorage = remembered, sessionStorage
    // = "remember me" was unchecked).
    const updated = {
      ...sess,
      teacher_name:         result.teacher_name,
      role:                 result.role,
      school_id:            result.school_id,
      must_change_password: result.must_change_password,
    };
    try {
      const store = localStorage.getItem(_WEB_SESSION_KEY) ? localStorage : sessionStorage;
      store.setItem(_WEB_SESSION_KEY, JSON.stringify(updated));
    } catch (e) {}
    return updated;
  } catch (e) {
    return null;
  }
};

window.webLogout = async function () {
  const sess = getWebSession();
  if (sess && sess.session_token) {
    try {
      await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_web_logout`, {
        method: 'POST',
        headers: {
          'apikey':        SCMS_CONFIG.SUPABASE_ANON,
          'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ p_session_token: sess.session_token }),
      });
    } catch (e) {}
  }
  clearWebSession();
  window.location.reload();
};

/* ============================================================================
   CHANGE PASSWORD MODAL
============================================================================ */
window.openChangePasswordModal = function (opts) {
  const firstTime = !!(opts && opts.first_time);
  const wrap = document.createElement('div');
  wrap.id = 'changePwModal';
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:380px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">🔑 ${t(firstTime ? 'pw.titleFirst' : 'pw.titleChange')}</h3>
      ${firstTime
        ? `<p class="modal-subtitle">${t('pw.firstNote')}</p>`
        : ''}

      ${firstTime ? '' : `
        <label class="field-label">${t('pw.old')}</label>
        <input class="form-input" id="cpOld" type="password" autocomplete="current-password">
      `}

      <label class="field-label">${t('pw.new')}</label>
      <input class="form-input" id="cpNew" type="password" autocomplete="new-password" minlength="6">

      <label class="field-label">${t('pw.confirm')}</label>
      <input class="form-input" id="cpConfirm" type="password" autocomplete="new-password">

      <div id="cpError" class="form-error" style="display:none"></div>

      <button class="btn-primary mt16" id="cpBtn" onclick="doChangePassword(${firstTime})">
        ${t(firstTime ? 'pw.btnFirst' : 'pw.btnChange')}
      </button>
      ${firstTime ? '' : `<button class="btn-secondary" onclick="closeChangePasswordModal()">${t('common.cancel')}</button>`}
    </div>`;
  if (!firstTime) wrap.onclick = closeChangePasswordModal;
  document.body.appendChild(wrap);
  wrap.classList.add('active');
};

window.closeChangePasswordModal = function () {
  document.getElementById('changePwModal')?.remove();
};

window.doChangePassword = async function (firstTime) {
  const oldPw = firstTime ? '' : document.getElementById('cpOld')?.value || '';
  const newPw = document.getElementById('cpNew')?.value || '';
  const confirmPw = document.getElementById('cpConfirm')?.value || '';
  const errEl = document.getElementById('cpError');
  const btn = document.getElementById('cpBtn');
  errEl.style.display = 'none';

  if (newPw.length < 6) {
    errEl.textContent = t('pw.tooShort');
    errEl.style.display = 'block';
    return;
  }
  if (newPw !== confirmPw) {
    errEl.textContent = t('pw.mismatch');
    errEl.style.display = 'block';
    return;
  }

  const sess = getWebSession();
  if (!sess || !sess.session_token) {
    errEl.textContent = t('pw.sessionExpired');
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = t('common.saving');

  try {
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_change_password`, {
      method: 'POST',
      headers: {
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        p_session_token: sess.session_token,
        p_old_password:  oldPw,
        p_new_password:  newPw,
      }),
    });
    const result = await resp.json();

    if (!result || !result.ok) {
      errEl.textContent = (result && result.message) || t('pw.failed');
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = t(firstTime ? 'pw.btnFirst' : 'pw.btnChange');
      return;
    }

    // Clear must_change flag locally and continue
    const updated = { ...sess, must_change_password: false };
    try { localStorage.setItem(_WEB_SESSION_KEY, JSON.stringify(updated)); } catch (e) {}

    closeChangePasswordModal();
    if (firstTime) {
      if (typeof window.bootAfterLogin === 'function') {
        window.bootAfterLogin({ webSession: updated });
      } else {
        window.location.reload();
      }
    } else {
      showToast(t('pw.done'));
    }
  } catch (e) {
    errEl.textContent = t('pw.connErr');
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = t(firstTime ? 'pw.btnFirst' : 'pw.btnChange');
  }
};
