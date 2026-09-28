/**
 * SCMS v11 — 01_config.js
 * Multi-tenant config: auto-detected from Telegram WebApp initData OR Capacitor app.
 *
 * Architecture:
 *   Platform A — Telegram WebApp (TWA, current)
 *     Telegram WebApp → initData (telegram_id) → n8n bootstrap webhook
 *     → rpc_bootstrap(school_id, telegram_id) → full school context
 *
 *   Platform B — Native App (Capacitor, future)
 *     Login screen → email/phone → n8n bootstrap webhook
 *     → same rpc_bootstrap → same context (telegram_id optional)
 *
 *   Both:
 *     Supabase direct (read-only, anon key) for live queries
 *     n8n TWA webhook (write operations — save_attendance, etc.)
 */

'use strict';

// ─── HARDCODED BACKEND CONSTANTS ────────────────────────────────────────────
const SCMS_CONFIG = {
  // Supabase project (read queries — students, attendance, etc.)
  SUPABASE_URL:    'https://rszgbryucqwmrdbsgwbb.supabase.co',
  SUPABASE_ANON:   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzemdicnl1Y3F3bXJkYnNnd2JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MjkzNjcsImV4cCI6MjA4NjQwNTM2N30.uN2cpmL48H3ZEJlZADh6b06bwecANo1mzIwPSBZRI5g',

  // n8n TWA webhook (all write operations)
  N8N_WEBHOOK:     'https://stailla.xyz/webhook/scms-twa',

  // n8n Bootstrap webhook (initial session resolve)
  N8N_BOOTSTRAP:   'https://stailla.xyz/webhook/scms-bootstrap',

  // Telegram bot username — used to build deep-links for parent TG ID capture
  // e.g. https://t.me/<BOT_USERNAME>?start=parent_STU-XXXXXX
  // Backend (n8n Merge Pre-State) parses regex: /^\/start\s+parent_(STU-[A-Z0-9]+)/i
  // ⚠️ MUST be your real bot username WITHOUT the @ — login deep-links break if wrong.
  BOT_USERNAME:    'VavidaISBbot',

  // ─── v11.7 — Google OAuth ─────────────────────────────────────────────────
  // OAuth 2.0 Web Client ID from Google Cloud Console (APIs & Services →
  // Credentials → OAuth 2.0 Client IDs → Web application). Must match the
  // GOOGLE_CLIENT_ID env var set on the `google-login` Supabase Edge Function.
  GOOGLE_CLIENT_ID: '71086878167-t6q46hrv5j5n46h9nfmeuk8sdoftb5lt.apps.googleusercontent.com',

  // Edge Function that verifies the Google ID token server-side and issues a
  // session (same shape as rpc_teacher_web_login's response).
  GOOGLE_LOGIN_URL: 'https://rszgbryucqwmrdbsgwbb.supabase.co/functions/v1/google-login',

  // App version — this is the single source of truth (shown in More → About,
  // and used for the git tag / release notes). There's no build step that
  // reads this into package.json, so when you bump this number, also update
  // "version" in package.json to match — package.json only feeds Capacitor/npm
  // tooling metadata, but keeping the two in sync avoids confusion later.
  VERSION: '11.7.0',
};

// ─── PLATFORM DETECTION ─────────────────────────────────────────────────────
// Used everywhere we need to know "are we inside Telegram (hide chat/sidebar)
// or running as native/standalone app (show full UI)?"
function _detectPlatform() {
  // 1. Capacitor / Cordova → native app
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    return 'native';
  }
  if (window.cordova) return 'native';

  // 2. Real Telegram WebApp (must have initData, not just SDK loaded)
  const tg = window.Telegram?.WebApp;
  if (tg && (tg.initData || tg.initDataUnsafe?.user)) {
    return 'twa';
  }

  // 3. Standalone PWA (added to home screen) — treat as native
  if (window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    return 'native';
  }

  // 4. Fallback — desktop browser preview
  return 'web';
}

// ─── RUNTIME STATE (populated after bootstrap) ──────────────────────────────
window.APP = {
  // Platform
  platform:     _detectPlatform(),    // 'twa' | 'native' | 'web'

  // Telegram context (TWA only)
  tg:           null,
  tgUser:       null,
  initData:     '',

  // School + teacher context (from rpc_bootstrap)
  school_id:    '',
  school_name:  '',
  teacher_id:   '',
  teacher_name: '',
  teacher_role: '',
  teacher_classes: '',
  is_admin:     false,
  config:       {},
  currentTerm:  null,

  // Local cache (from bootstrap)
  students:     [],
  attendance:   [],
  dailyReports: [],
  homework:     [],
  parentComms:  [],
  incidents:    [],
  timetable:    [],
  subjects:     [],
  terms:        [],
  monthlySummary: [],
  chatMessages: [],   // teacher-to-teacher / staff chat (native only)

  // Supabase client (for reads)
  supabase:     null,

  // Boot state
  ready:        false,
  demo:         false,

  // UI state
  sidebarOpen:  false,
  currentPage:  'students',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Is the app currently embedded inside Telegram? */
window.isTWA = function() {
  return window.APP.platform === 'twa';
};

/** Is the app running as a native app (Capacitor / standalone PWA)? */
window.isNative = function() {
  return window.APP.platform === 'native';
};

/**
 * Normalize a URL so accidental trailing slashes or double-slashes don't
 * break the request. e.g.
 *   "https://x.com//webhook/y"  →  "https://x.com/webhook/y"
 *   "https://x.com/webhook/y/"  →  "https://x.com/webhook/y"
 */
function _normUrl(u) {
  if (!u || typeof u !== 'string') return u;
  // Preserve the protocol's "://"
  const m = u.match(/^([a-z]+:\/\/)(.*)$/i);
  if (!m) return u;
  const proto = m[1];
  let rest = m[2];
  // Collapse any "//" runs in the path
  rest = rest.replace(/\/{2,}/g, '/');
  // Drop trailing slash
  rest = rest.replace(/\/+$/, '');
  return proto + rest;
}

// Auto-clean the user-provided URLs so typos don't matter
SCMS_CONFIG.SUPABASE_URL    = _normUrl(SCMS_CONFIG.SUPABASE_URL);
SCMS_CONFIG.N8N_WEBHOOK     = _normUrl(SCMS_CONFIG.N8N_WEBHOOK);
SCMS_CONFIG.N8N_BOOTSTRAP   = _normUrl(SCMS_CONFIG.N8N_BOOTSTRAP);
SCMS_CONFIG.GOOGLE_LOGIN_URL = _normUrl(SCMS_CONFIG.GOOGLE_LOGIN_URL);

/** Post to n8n TWA webhook. Always injects school_id + teacher_id. */
async function twaPost(action, data = {}) {
  const payload = {
    action,
    school_id:  window.APP.school_id,
    teacher_id: window.APP.teacher_id,
    platform:   window.APP.platform,
    data,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let resp;
  try {
    resp = await fetch(SCMS_CONFIG.N8N_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });
  } catch (netErr) {
    if (netErr.name === 'AbortError') {
      throw new Error(`TWA ${action} timed out after 15s — n8n server did not respond. Check the n8n execution log for this webhook.`);
    }
    throw new Error('Network error: ' + (netErr.message || netErr));
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`TWA ${action} failed ${resp.status}: ${txt}`);
  }
  return resp.json().catch(() => ({}));
}

/** Direct Supabase query (read-only, anon key). */
async function sbQuery(table, params = '') {
  const url = `${SCMS_CONFIG.SUPABASE_URL}/rest/v1/${table}?${params}`;
  const resp = await fetch(url, {
    headers: {
      'apikey':        SCMS_CONFIG.SUPABASE_ANON,
      'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
    },
  });
  if (!resp.ok) throw new Error(`Supabase ${table} ${resp.status}`);
  return resp.json();
}

/** Build the parent-link deep-link for a freshly added student. */
window.buildParentLinkURL = function(studentId) {
  const bot = SCMS_CONFIG.BOT_USERNAME || 'YourSchoolBot';
  // Backend regex: /^\/start\s+parent_(STU-[A-Z0-9]+)/i
  // → must be `parent_<STU-XXX>` exactly (no "link_" prefix).
  return `https://t.me/${bot}?start=parent_${encodeURIComponent(studentId)}`;
};

// Expose globally
window.SCMS_CONFIG = SCMS_CONFIG;
window.twaPost     = twaPost;
window.sbQuery     = sbQuery;
