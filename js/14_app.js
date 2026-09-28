/**
 * SCMS v11 — 14_app.js
 * Main application entry point.
 *
 * Boot sequence:
 *   1. Detect platform (twa / native / web)
 *   2. Telegram.WebApp.ready() + expand (TWA only)
 *   3. Extract initData / telegram_id (TWA) OR show login (native, if no session)
 *   4. POST to n8n bootstrap webhook → rpc_bootstrap
 *   5. Populate APP context
 *   6. Init Supabase client (anon, read-only)
 *   7. Render all modules + show/hide platform-specific UI
 *   8. Hide boot screen
 */

'use strict';

/**
 * `initApp()` runs once on first load. It also runs again after the user
 * completes the Telegram-login flow on the landing page (see 00_landing.js
 * which calls `window.bootAfterLogin()`).
 */
async function initApp() {
  const bootStatus = document.getElementById('bootStatus');
  const bootSub    = document.getElementById('bootSub');
  const bootScreen = document.getElementById('bootScreen');
  const errorScreen = document.getElementById('errorScreen');

  function setStatus(msg, sub) {
    if (bootStatus) bootStatus.textContent = msg;
    if (sub && bootSub) bootSub.textContent = sub;
  }

  function showError(title, msg) {
    const titleEl = document.getElementById('errorTitle');
    const msgEl   = document.getElementById('errorMsg');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) {
      // Use whitespace-pre-wrap so newlines render. Also escape HTML.
      msgEl.style.whiteSpace = 'pre-wrap';
      msgEl.style.textAlign = 'left';
      msgEl.style.fontSize = '13px';
      msgEl.style.lineHeight = '1.5';
      msgEl.textContent = msg;
    }
    if (bootScreen) bootScreen.style.display = 'none';
    if (errorScreen) errorScreen.style.display = 'flex';
  }

  try {
    // ── Step 1: Apply platform-specific class to body ────────────────────
    document.documentElement.setAttribute('data-platform', window.APP.platform);

    setStatus(
      window.APP.platform === 'twa' ? t('boot.openingTg') :
      window.APP.platform === 'native' ? t('boot.starting') :
      t('boot.preview'),
      t('boot.title')
    );

    // ── Step 2: Telegram WebApp init (TWA only) ──────────────────────────
    if (window.APP.platform === 'twa') {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        tg.enableClosingConfirmation();
        window.APP.tg       = tg;
        window.APP.initData = tg.initData || '';
        window.APP.tgUser   = tg.initDataUnsafe?.user || null;

        // Apply Telegram theme colors
        if (tg.colorScheme === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
        if (tg.themeParams?.bg_color) {
          document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color);
        }
      }
    }

    const tgUser = window.APP.tgUser;
    let telegram_id = tgUser ? String(tgUser.id) : null;

    // ── Step 2b: Landing-page gate (native / web only) ───────────────────
    // If we're not inside Telegram AND we have no saved session, show the
    // landing screen and let the user sign in.
    let webSession = null;
    if (!isTWA()) {
      const saved = (typeof getSavedSession === 'function') ? getSavedSession() : null;
      if (saved && saved.telegram_id) {
        // Silent login: reuse saved telegram_id for bootstrap
        telegram_id = String(saved.telegram_id);
        window.APP.savedSession = saved;
      } else if (typeof verifyWebSession === 'function') {
        // Try web session next (v11.6+)
        try {
          webSession = await verifyWebSession();
        } catch (e) {
          console.warn('[boot] web session verify failed:', e);
        }
        if (webSession && webSession.session_token) {
          // Use the teacher_id directly — no Telegram needed
          window.APP.webSession = webSession;
          window.APP.teacher_id = webSession.teacher_id;
          window.APP.teacher_name = webSession.teacher_name;
          window.APP.school_id = webSession.school_id;
          window.APP.role = webSession.role;
        } else if (typeof shouldShowLanding === 'function' && shouldShowLanding()) {
          // No session anywhere — show landing
          if (typeof renderLanding === 'function') renderLanding();
          return;
        }
      } else if (typeof shouldShowLanding === 'function' && shouldShowLanding()) {
        if (typeof renderLanding === 'function') renderLanding();
        return;
      }
    }

    // ── Step 3: Bootstrap via n8n ────────────────────────────────────────
    setStatus(t('boot.auth'), telegram_id ? t('boot.user', { name: tgUser?.first_name || '' }) : t('msg.loading'));

    let bootstrapData = null;
    let bootstrapError = null;

    if (telegram_id && SCMS_CONFIG.N8N_BOOTSTRAP && !SCMS_CONFIG.N8N_BOOTSTRAP.includes('your-n8n')) {
      try {
        console.log('[boot] POST', SCMS_CONFIG.N8N_BOOTSTRAP, 'telegram_id=', telegram_id);
        bootstrapData = await API.bootstrap(telegram_id);
        console.log('[boot] response:', bootstrapData);
      } catch (e) {
        bootstrapError = e;
        console.error('[boot] bootstrap fetch failed:', e);
        console.error('[boot] URL was:', SCMS_CONFIG.N8N_BOOTSTRAP);
      }
    } else if (webSession && SCMS_CONFIG.N8N_BOOTSTRAP && !SCMS_CONFIG.N8N_BOOTSTRAP.includes('your-n8n')) {
      // Web-session bootstrap — single RPC, then fetch lists from Supabase
      try {
        console.log('[boot] web bootstrap for teacher=', webSession.teacher_id);
        const webData = await API.bootstrapByTeacher(webSession.teacher_id, webSession.session_token);
        // Adapt the web RPC's flat shape into the Telegram bootstrap shape.
        bootstrapData = {
          ok:           true,
          auth_mode:    'web',
          schoolConfig: {
            school_id:   webData.school_id,
            school_name: webData.school_name,
            school_logo: webData.school_config?.school_logo || '',
            school_cover: webData.school_config?.school_cover || '',
          },
          user: {
            teacher_id:   webData.teacher_id,
            teacher_name: webData.teacher_name,
            role:         webData.is_admin ? 'Admin' : (webData.teacher_role || 'Teacher'),
            classes:      Array.isArray(webData.classes) ? webData.classes.join(',') : '',
            telegram_id:  webData.telegram_id || null,
            photo_url:    webData.teacher_photo_url || '',
            ui_prefs:     webData.ui_prefs || {},
          },
          config:        webData.school_config || {},
          // The lists below will be filled by a follow-up fetch
          students:      [],
          attendance:    [],
          dailyReports:  [],
          homework:      [],
          parentComms:   [],
          incidents:     [],
          timetable:     [],
        };
        console.log('[boot] web bootstrap OK', bootstrapData);
      } catch (e) {
        bootstrapError = e;
        console.error('[boot] web bootstrap failed:', e);
      }
    }

    if (!bootstrapData && !telegram_id) {
      console.warn('No Telegram context. Running in preview mode.');
      bootstrapData = _demoBootstrap();
      window.APP.demo = true;
    } else if (!bootstrapData) {
      // Build a detailed, debuggable error message
      const errParts = ['Could not reach the SCMS server.'];
      if (bootstrapError) {
        errParts.push('');
        errParts.push('Technical details (screenshot if asking for help):');
        errParts.push('• URL: ' + SCMS_CONFIG.N8N_BOOTSTRAP);
        errParts.push('• Error: ' + (bootstrapError.message || String(bootstrapError)));
        if (bootstrapError.message?.includes('Failed to fetch')) {
          errParts.push('');
          errParts.push('Likely cause: the n8n workflow is not Active, the URL is wrong, or CORS is blocking the request.');
        }
      }
      showError(t('err.connFailed'), errParts.join('\n'));
      return;
    }

    if (!bootstrapData.ok) {
      showError(t('err.authFailed'), bootstrapData.error || t('err.notRegistered'));
      return;
    }

    // ── Step 4: Populate APP context ─────────────────────────────────────
    setStatus(t('boot.loadingSchool'), bootstrapData.schoolConfig?.school_name || '');

    const sc = bootstrapData.schoolConfig || {};
    const u  = bootstrapData.user || {};

    window.APP.school_id      = sc.school_id || '';
    window.APP.school_name    = sc.school_name || 'SCMS';
    window.APP.school_logo    = sc.school_logo || (bootstrapData.config && bootstrapData.config.school_logo) || '';
    window.APP.school_cover   = sc.school_cover || (bootstrapData.config && bootstrapData.config.school_cover) || '';
    window.APP.teacher_photo_url = u.photo_url || '';
    window.APP.ui_prefs       = u.ui_prefs || {};
    window.APP.teacher_id     = u.teacher_id || '';
    window.APP.teacher_name   = u.teacher_name || tgUser?.first_name || '';
    window.APP.teacher_role   = u.role || '';
    window.APP.teacher_classes = u.classes || '';
    window.APP.is_admin       = ['Admin', 'Principal', 'HT'].includes(u.role);
    window.APP.telegram_id    = u.telegram_id || telegram_id || null;
    window.APP.config         = bootstrapData.config || {};
    window.APP.currentTerm    = bootstrapData.currentTerm || null;

    window.APP.students       = bootstrapData.students       || [];
    window.APP.attendance     = bootstrapData.attendance     || [];
    window.APP.dailyReports   = bootstrapData.dailyReports   || [];
    window.APP.homework       = bootstrapData.homework       || [];
    window.APP.parentComms    = bootstrapData.parentComms    || [];
    window.APP.incidents      = bootstrapData.incidents      || [];
    window.APP.timetable      = bootstrapData.timetable      || [];
    window.APP.subjects       = bootstrapData.subjects       || [];
    window.APP.terms          = bootstrapData.terms          || [];
    window.APP.monthlySummary = bootstrapData.monthlySummary || [];

    window.APP.ready = true;

    // ── Step 4b: Web-session — load students/lists from Supabase ─────────
    // The web bootstrap RPC returns school+teacher only; lists come direct.
    if (bootstrapData.auth_mode === 'web') {
      try {
        const [students, attendance, daily, homework, comms, incidents, tt] = await Promise.all([
          API.getStudents().catch(() => []),
          API.getAttendance(30).catch(() => []),
          API.getDailyReports(7).catch(() => []),
          API.getHomework(30).catch(() => []),
          API.getParentComms(30).catch(() => []),
          API.getIncidents(30).catch(() => []),
          API.getTimetable().catch(() => []),
        ]);
        window.APP.students     = students || [];
        window.APP.attendance   = attendance || [];
        window.APP.dailyReports = daily || [];
        window.APP.homework     = homework || [];
        window.APP.parentComms  = comms || [];
        window.APP.incidents    = incidents || [];
        window.APP.timetable    = tt || [];
        console.log('[boot] web-mode lists loaded:', window.APP.students.length, 'students');
      } catch (e) {
        console.warn('[boot] partial list load failed:', e);
      }
    }

    // ── Step 5: Init Supabase client ─────────────────────────────────────
    if (window.supabase && SCMS_CONFIG.SUPABASE_URL && SCMS_CONFIG.SUPABASE_ANON &&
        !SCMS_CONFIG.SUPABASE_ANON.includes('PLACEHOLDER')) {
      window.APP.supabase = window.supabase.createClient(
        SCMS_CONFIG.SUPABASE_URL,
        SCMS_CONFIG.SUPABASE_ANON
      );
    }

    // ── Step 6: Update header UI ─────────────────────────────────────────
    document.getElementById('schoolName').textContent = window.APP.school_name;
    document.getElementById('userName').textContent   = window.APP.teacher_name;
    document.getElementById('userRole').textContent   = window.APP.teacher_role || '—';
    document.getElementById('connDot').classList.add('online');

    // ── Step 7: Render modules ───────────────────────────────────────────
    setStatus(t('boot.building'), '');

    if (typeof renderDashboard  === 'function') renderDashboard();
    if (typeof renderStudents   === 'function') renderStudents();
    if (typeof renderAttendance === 'function') renderAttendance();
    if (typeof renderDaily      === 'function') renderDaily();
    if (typeof renderHomework   === 'function') renderHomework();
    if (typeof renderComms      === 'function') renderComms();
    if (typeof renderIncidents  === 'function') renderIncidents();
    if (typeof renderTimetable  === 'function') renderTimetable();
    if (typeof renderSummary    === 'function') renderSummary();
    if (typeof renderGrades     === 'function') renderGrades();
    if (typeof renderBilling    === 'function') renderBilling();
    if (typeof renderAdmissions === 'function') renderAdmissions();
    if (typeof renderMore       === 'function') renderMore();
    if (typeof renderSidebar    === 'function') renderSidebar();
    if (typeof _applyLogoToHeader === 'function') _applyLogoToHeader();
    // Chat is rendered lazily when user opens it

    // Tab bar + FAB + Refresh + Burger
    _initTabBar();
    _initFab();
    _initBurger();
    _initBackdrops();

    // Refresh button
    document.getElementById('btnRefresh').addEventListener('click', async () => {
      showToast(t('toast.refreshing'));
      try {
        await API.refreshAll();
        if (typeof renderStudents  === 'function') renderStudents();
        if (typeof renderAttendance === 'function') renderAttendance();
        if (typeof renderDaily     === 'function') renderDaily();
        if (typeof renderHomework  === 'function') renderHomework();
        showToast(t('toast.updated'));
      } catch (e) {
        showToast(t('toast.refreshFailed'));
      }
    });

    // ── Step 8: Hide boot screen ─────────────────────────────────────────
    setTimeout(() => {
      if (bootScreen) {
        bootScreen.classList.add('fade-out');
        setTimeout(() => { bootScreen.style.display = 'none'; }, 350);
      }
      // First-launch coachmark tour (runs once for new users)
      if (typeof maybeStartTour === 'function') maybeStartTour();
    }, 400);
// ── Step 9: Show dashboard as landing page ──────────────────────────
    window.APP.currentPage = 'dashboard';
    if (typeof goToPage === 'function') goToPage('dashboard');
    // Online/offline detection
    window.addEventListener('online',  () => {
      document.getElementById('offlineBanner').style.display = 'none';
      document.getElementById('connDot').classList.add('online');
    });
    window.addEventListener('offline', () => {
      document.getElementById('offlineBanner').style.display = 'flex';
      document.getElementById('connDot').classList.remove('online');
    });

    if (!navigator.onLine) {
      document.getElementById('offlineBanner').style.display = 'flex';
    }

  } catch (err) {
    console.error('App init error:', err);
    showError(t('err.startup'), err.message || t('err.unknown'));
  }
}

// Auto-run once on script load
initApp();

// Exposed so 00_landing.js can re-run boot after Telegram login completes
window.bootAfterLogin = function () {
  // Reset error/boot UI back to spinner state
  const boot = document.getElementById('bootScreen');
  if (boot) {
    boot.style.display = 'flex';
    boot.innerHTML = `
      <div class="boot-inner">
        <div class="boot-logo">
          <span class="boot-logo-mark">S</span>
          <span class="boot-logo-text">CMS</span>
        </div>
        <div class="boot-spinner"><div class="spin-ring"></div></div>
        <div class="boot-status" id="bootStatus">${t('boot.signingIn')}</div>
        <div class="boot-sub" id="bootSub">${t('boot.loadingYourSchool')}</div>
      </div>`;
  }
  initApp();
};

// Exposed so the More menu can offer a "Sign out" option
window.signOut = function () {
  if (typeof clearSavedSession === 'function') clearSavedSession();
  // v11.7: also clear the web session (Google / email+password / Teacher-ID
  // logins) — this function used to only clear the legacy Telegram-native
  // session, so web-session users could never actually sign out; the app
  // would just log them straight back in on reload.
  if (typeof clearWebSession === 'function') clearWebSession();
  window.location.reload();
};

    

// ─── PAGE NAVIGATION ────────────────────────────────────────────────────────

window.goToPage = function(pageId) {
  // Stop chat polling if leaving chat
  if (window.APP.currentPage === 'chat' && pageId !== 'chat' && typeof stopChatPolling === 'function') {
    stopChatPolling();
  }

  const tabs  = document.querySelectorAll('.tab-btn');
  const pages = document.querySelectorAll('.page');

  tabs.forEach(t => t.classList.toggle('active', t.dataset.page === pageId));
  pages.forEach(p => p.classList.toggle('active', p.id === `page-${pageId}`));

  window.APP.currentPage = pageId;

  // Update FAB visibility & action for this page
  if (typeof _updateFabForPage === 'function') _updateFabForPage(pageId);

  // Lazy renders / per-page hooks
  if (pageId === 'chat') {
    if (typeof renderChat === 'function') renderChat();
    if (typeof startChatPolling === 'function') startChatPolling();
  }
  if (pageId === 'more' && typeof renderMore === 'function') renderMore();
  if (pageId === 'billing' && typeof renderBilling === 'function') renderBilling();
  if (pageId === 'admissions' && typeof renderAdmissions === 'function') renderAdmissions();
  if (pageId === 'library' && typeof renderLibrary === 'function') renderLibrary();
  if (pageId === 'transport' && typeof renderTransport === 'function') renderTransport();
  if (pageId === 'grades' && typeof renderGrades === 'function') renderGrades();
  if (pageId === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
  if (pageId === 'leave' && typeof renderLeaveRequests === 'function') renderLeaveRequests();
  
  // Update sidebar highlight
  document.querySelectorAll('.sidebar-item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === pageId));

  // Scroll content to top
  document.getElementById('pages')?.scrollTo({ top: 0, behavior: 'smooth' });

  if (window.APP.tg?.HapticFeedback) {
    window.APP.tg.HapticFeedback.selectionChanged();
  }
};

// ─── LANGUAGE SWITCH → re-render JS-generated text ──────────────────────────
// Static [data-i18n] nodes are handled by I18N.apply(); everything built in JS
// with t() has to be rebuilt, so re-render the landing screen / sidebar / the
// pages that are already on screen.
window.addEventListener('languageChanged', () => {
  const boot = document.getElementById('bootScreen');
  if (boot && boot.style.display !== 'none' && boot.querySelector('.landing-shell')) {
    if (typeof renderLanding === 'function') renderLanding();
    return;
  }
  if (!window.APP || !Array.isArray(window.APP.students)) return;   // app not loaded yet
  const safe = (fn) => { try { if (typeof fn === 'function') fn(); } catch (e) { console.warn('[i18n] re-render failed', e); } };

  safe(window.renderSidebar);

  // Pages that are built once at boot from local data: rebuild ALL of them, not just the
  // visible one — otherwise switching language leaves stale text (the previous language)
  // on every page you are not currently looking at.
  [ 'renderStudents', 'renderAttendance', 'renderDaily', 'renderHomework',
    'renderComms', 'renderIncidents', 'renderTimetable', 'renderSummary' ]
    .forEach(name => safe(window[name]));

  // Lazily rendered pages (they fetch data when opened): only refresh the one on screen.
  const lazy = { more: 'renderMore', billing: 'renderBilling', admissions: 'renderAdmissions',
                 library: 'renderLibrary', transport: 'renderTransport', grades: 'renderGrades',
                 chat: 'renderChat',dashboard: 'renderDashboard' };
  const fn = lazy[window.APP.currentPage];
  if (fn) safe(window[fn]);
});

// ─── TAB BAR ────────────────────────────────────────────────────────────────

function _initTabBar() {
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => goToPage(tab.dataset.page));
  });
}

// ─── BURGER MENU (native only) ──────────────────────────────────────────────

function _initBurger() {
  const burger = document.getElementById('btnBurger');
  if (!burger) return;
  burger.addEventListener('click', () => toggleSidebar());
}

function _initBackdrops() {
  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => closeSidebar());
}

// ─── FAB ────────────────────────────────────────────────────────────────────
// FAB only appears on pages where a "primary new action" makes sense.
// Pages that already have their own dedicated CTA, or where adding doesn't
// apply, don't get a FAB.

const FAB_PAGES = {
  // pageId : { icon, title, action }
  students:  { title: 'Add student',        action: () => openAddStudentModal() },
  daily:     { title: 'Write daily report', action: () => openDailyReportModal() },
  hw:        { title: 'Add homework',       action: () => openHomeworkModal() },
  incidents: { title: 'Log incident',       action: () => openIncidentModal() },
  parents:   { title: 'Message parent',     action: () => openParentCommModal() },
  grades:    { title: 'New assessment',     action: () => openNewAssessmentModal() },
  billing:   { title: 'New invoice',        action: () => openNewInvoiceModal() },
  admissions:{ title: 'Add applicant',      action: () => openNewAdmissionModal() },
  library:   { title: 'Add book',           action: () => openNewBookModal() },
  transport: { title: 'Add route',          action: () => openNewRouteModal() },
  timetable: { title: 'Add timetable entry',action: () => openAddTimetable() },
};

function _updateFabForPage(pageId) {
  const fab = document.getElementById('fab');
  if (!fab) return;
  const conf = FAB_PAGES[pageId];
  if (conf) {
    fab.style.display = 'flex';
    fab.setAttribute('aria-label', conf.title);
    fab.setAttribute('title', conf.title);
    fab._action = conf.action;
  } else {
    fab.style.display = 'none';
    fab._action = null;
  }
}
window._updateFabForPage = _updateFabForPage;

function _initFab() {
  const fab = document.getElementById('fab');
  if (!fab) return;

  fab.addEventListener('click', () => {
    if (typeof fab._action === 'function') {
      try { fab._action(); } catch (e) { console.error('[FAB]', e); }
    }
    if (window.APP.tg?.HapticFeedback) {
      window.APP.tg.HapticFeedback.impactOccurred('light');
    }
  });

  // Initial state
  _updateFabForPage(window.APP.currentPage || 'students');
}

// ─── DEMO BOOTSTRAP (browser preview without Telegram) ──────────────────────

function _demoBootstrap() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    schoolConfig: {
      school_id:    'SCH-DEMO',
      school_name:  'Demo International School',
      school_logo:  '',
      country:      'Myanmar',
      timezone:     'Asia/Yangon',
    },
    config: {
      subjects:         ['Mathematics', 'English', 'Science', 'Social Studies', 'Art', 'Music', 'PE'],
      attendance_codes: [
        { code: 'P', label: 'Present',  color: '#10B981' },
        { code: 'A', label: 'Absent',   color: '#EF4444' },
        { code: 'L', label: 'Leave',    color: '#3B82F6' },
        { code: 'T', label: 'Tardy',    color: '#F59E0B' },
        { code: 'S', label: 'Sick',     color: '#DC2626' },
        { code: 'E', label: 'Excused',  color: '#0891B2' },
        { code: 'H', label: 'Half-day', color: '#7C3AED' },
      ],
      incident_types:   ['Good Behaviour', 'Participation', 'Achievement', 'Concern', 'Health', 'Other'],
      severities:       ['Info', 'Low', 'Medium', 'High'],
      grades:           ['KG', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    },
    currentTerm: { term_name: 'Term 1 2024-25', start_date: '2024-09-01', end_date: '2024-12-20', is_current: true },
    user: {
      teacher_id:   'T-DEMO',
      teacher_name: 'Demo Teacher',
      role:         'Teacher',
      classes:      'P3,P4',
      status:       'active',
    },
    students: [
      { student_id: 'STU-DEMO-0001', name_en: 'Alice Chen',   name_local: 'အေးချမ်း', class: 'P3', gender: 'F', grade: 'P3', status: 'Active', parent_tg_id: '', parent_name: 'Mrs. Chen', parent_phone: '+95 9 123 456 789', parent_email: 'chen@example.com', date_of_birth: '2017-03-14', home_color: 'blue' },
      { student_id: 'STU-DEMO-0002', name_en: 'Bob Tan',      name_local: 'ဘို',       class: 'P3', gender: 'M', grade: 'P3', status: 'Active', parent_tg_id: '123456', parent_name: 'Mr. Tan', parent_phone: '+95 9 222 333 444', date_of_birth: '2017-07-22', home_color: 'red' },
      { student_id: 'STU-DEMO-0003', name_en: 'Clara Myint',  name_local: 'ကလာ',     class: 'P4', gender: 'F', grade: 'P4', status: 'Active', parent_tg_id: '', parent_name: 'Daw Myint', parent_phone: '+95 9 555 666 777', date_of_birth: '2016-11-08', home_color: 'green' },
      { student_id: 'STU-DEMO-0004', name_en: 'David Lwin',   name_local: 'ဒေးဗစ်', class: 'P4', gender: 'M', grade: 'P4', status: 'Active', parent_tg_id: '', parent_name: 'U Lwin', parent_phone: '+95 9 888 999 000', date_of_birth: '2016-05-30', home_color: 'amber' },
    ],
    attendance: [
      { student_id: 'STU-DEMO-0001', class: 'P3', date: today, status: 'P' },
      { student_id: 'STU-DEMO-0002', class: 'P3', date: today, status: 'L' },
    ],
    dailyReports:   [],
    homework:       [],
    parentComms:    [],
    incidents:      [],
    timetable:      [],
    subjects:       [],
    terms:          [],
    monthlySummary: [],
    chatMessages:   [],
  };
}

// ─── GLOBAL TOAST ────────────────────────────────────────────────────────────

window.showToast = function(msg, duration = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), duration);
};

// ─── GLOBAL MODAL HELPERS ────────────────────────────────────────────────────

window._modalStack = []; // stacked modal layers

window.openModal = function(html, onClose) {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('active');

  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  // Every modal sheet gets a small "✕" in its top-right corner, in
  // addition to any Cancel button the form itself has — on a full-screen
  // mobile sheet there's no visible backdrop to tap to dismiss, so this is
  // often the only easy way to back out without finishing the form.
  layer.innerHTML = html.replace(
    /(<div class="modal-sheet"[^>]*>)/,
    `$1<button type="button" class="modal-close-x" onclick="event.stopPropagation();closeModal()" aria-label="${t('common.close')}">✕</button>`
  );
  layer.onclick = function(e) {
    if (e.target === layer) closeModal();
  };
  overlay.appendChild(layer);

  window._modalStack.push({ layer, onClose });
};

window.closeModal = function(onCloseOverride) {
  const overlay = document.getElementById('modalOverlay');
  const top = window._modalStack.pop();
  if (!top) {
    overlay.classList.remove('active');
    overlay.innerHTML = '';
    return;
  }
  top.layer.remove();
  if (!window._modalStack.length) {
    overlay.classList.remove('active');
  }
  const cb = onCloseOverride || top.onClose;
  if (typeof cb === 'function') cb();
};
// ─── GENERIC CONFIRM DIALOG (replaces native confirm()) ─────────────────────
window.showConfirm = function (title, message, confirmLabel, onConfirm, opts = {}) {
  const danger = opts.danger !== false;
  const wrap = document.createElement('div');
  wrap.id = '_genericConfirmModal';
  wrap.className = 'modal-overlay';
  wrap.innerHTML = `
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:360px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${esc(title)}</h3>
      <p class="modal-subtitle">${esc(message)}</p>
      <button class="${danger ? 'btn-danger solid' : 'btn-primary'} mt16" id="_genericConfirmBtn">${esc(confirmLabel)}</button>
      <button class="btn-secondary mt8" id="_genericConfirmCancel">${t('common.cancel')}</button>
    </div>`;
  wrap.onclick = window._closeGenericConfirm;
  document.body.appendChild(wrap);
  wrap.classList.add('active');

  document.getElementById('_genericConfirmCancel').onclick = window._closeGenericConfirm;
  document.getElementById('_genericConfirmBtn').onclick = () => {
    window._closeGenericConfirm();
    onConfirm();
  };
};

window._closeGenericConfirm = function () {
  document.getElementById('_genericConfirmModal')?.remove();
};

// ─── SKELETON LOADING HELPER ─────────────────────────────────────────────────

window.skeletonCards = function(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton-line w60"></div>
      <div class="skeleton-line w40"></div>
      <div class="skeleton-line w80"></div>
    </div>
  `).join('');
};

// ─── EMPTY STATE HELPER ──────────────────────────────────────────────────────

window.emptyState = function(icon, title, subtitle = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${esc(title)}</div>
      ${subtitle ? `<div class="empty-sub">${esc(subtitle)}</div>` : ''}
    </div>
  `;
};
