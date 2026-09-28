/**
 * SCMS v11 — 03_utils.js
 * Shared utility functions.
 */

'use strict';

/** Format ISO date as "Mon 12 Jan" */
window.fmtDate = function(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday:'short', day:'numeric', month:'short' });
  } catch { return iso; }
};

/** Format ISO date as "Jan 12, 2017" */
window.fmtDateLong = function(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  } catch { return iso; }
};

/** Compute age in years from an ISO birthday. */
window.computeAge = function(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
};

/** Days until next birthday — useful for "🎂 in 3 days" badges. */
window.daysUntilBirthday = function(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return Math.ceil((next - now) / 86400000);
};

/** Short relative time: "2h ago", "Yesterday", etc. */
window.relTime = function(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m <   2) return 'Just now';
  if (m <  60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h <  24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d ===  1) return 'Yesterday';
  if (d <    7) return `${d} days ago`;
  return fmtDate(iso);
};

/** Debounce helper */
window.debounce = function(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/** Escape HTML to prevent injection in dynamic strings. */
window.esc = function(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
  );
};

/** Group array by key */
window.groupBy = function(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'Other';
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
};

/** Attendance rate % */
window.attendRate = function(studentId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const records = window.APP.attendance.filter(
    a => a.student_id === studentId && a.date >= since
  );
  if (!records.length) return null;
  const present = records.filter(a => ['P', 'H'].includes(a.status)).length;
  return Math.round((present / records.length) * 100);
};

/** Validate email (loose RFC-ish check) */
window.isValidEmail = function(s) {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
};

/** Validate phone (digits, +, -, space, parentheses, 5+ chars) */
window.isValidPhone = function(s) {
  if (!s) return false;
  const digits = s.replace(/[^\d]/g, '');
  return digits.length >= 5;
};

/** Predefined "home colors" — the colour assigned to a student's house/team.
 *  Picked as accessible, distinct hues that look good on both light and dark themes. */
window.HOME_COLORS = [
  { id: 'red',     name: 'Red',     hex: '#DC2626' },
  { id: 'orange',  name: 'Orange',  hex: '#EA580C' },
  { id: 'amber',   name: 'Amber',   hex: '#D97706' },
  { id: 'yellow',  name: 'Yellow',  hex: '#CA8A04' },
  { id: 'lime',    name: 'Lime',    hex: '#65A30D' },
  { id: 'green',   name: 'Green',   hex: '#059669' },
  { id: 'teal',    name: 'Teal',    hex: '#0D9488' },
  { id: 'cyan',    name: 'Cyan',    hex: '#0891B2' },
  { id: 'sky',     name: 'Sky',     hex: '#0284C7' },
  { id: 'blue',    name: 'Blue',    hex: '#2563EB' },
  { id: 'indigo',  name: 'Indigo',  hex: '#4F46E5' },
  { id: 'violet',  name: 'Violet',  hex: '#7C3AED' },
  { id: 'fuchsia', name: 'Fuchsia', hex: '#C026D3' },
  { id: 'pink',    name: 'Pink',    hex: '#DB2777' },
  { id: 'rose',    name: 'Rose',    hex: '#E11D48' },
  { id: 'slate',   name: 'Slate',   hex: '#475569' },
];

/** Lookup the hex value for a home_color id; returns a neutral grey for unknown. */
window.homeColorHex = function(id) {
  const c = window.HOME_COLORS.find(c => c.id === id);
  return c ? c.hex : '#8A8A82';
};

/** Lookup the display name for a home_color id. */
window.homeColorName = function(id) {
  const c = window.HOME_COLORS.find(c => c.id === id);
  return c ? t('color.' + c.id) : (id || '—');
};

/** Friendly attendance code dictionary.
 *  Used everywhere we need to translate a single-letter code (P/A/L/T/S/E/H)
 *  into a human-readable label. Falls back to the code itself if not found. */
const _ATT_COLORS = { P: '#10B981', A: '#EF4444', L: '#3B82F6', T: '#F59E0B', S: '#DC2626', E: '#0891B2', H: '#7C3AED' };
// label / short / desc are getters so they follow the current language.
window.ATTENDANCE_CODE_LABELS = Object.fromEntries(Object.entries(_ATT_COLORS).map(([code, color]) => [code, {
  get label() { return t('att.code.' + code + '.label'); },
  get short() { return t('att.code.' + code + '.short'); },
  get desc()  { return t('att.code.' + code + '.desc'); },
  color,
}]));

window.attendCodeLabel = function(code) {
  return window.ATTENDANCE_CODE_LABELS[code]?.label || code || '—';
};

window.attendCodeColor = function(code) {
  return window.ATTENDANCE_CODE_LABELS[code]?.color || '#8A8A82';
};

/* ─── Class & Grade lists (user-defined per school) ───────────────────────
 * Stored in school config (config.classes / config.grades) and editable
 * from Settings → School setup. Falls back to existing-data discovery so
 * old schools work without admin setup.
 */

/** Return the list of class names the school uses. */
window.getClassList = function() {
  const cfg = (window.APP.config || {});
  if (Array.isArray(cfg.classes) && cfg.classes.length) {
    return cfg.classes.slice();
  }
  // Fallback: discover from existing student data
  const set = new Set(
    (window.APP.students || [])
      .map(s => s.class)
      .filter(Boolean)
  );
  return [...set].sort();
};
/* ─── Student avatar: photo > gender icon > initial letter ─────────── */

const AVATAR_ICON_BOY = `<svg viewBox="0 0 48 48" width="66%" height="66%" style="display:block"><path fill="#fff" d="M24 6c-6.6 0-12 5.4-12 12 0 1 .1 2 .3 2.9C13.6 16.6 18.4 13 24 13s10.4 3.6 11.7 7.9c.2-.9.3-1.9.3-2.9 0-6.6-5.4-12-12-12z"/><circle fill="#fff" cx="24" cy="21" r="9.5"/><circle fill="rgba(0,0,0,.35)" cx="20" cy="21" r="1.4"/><circle fill="rgba(0,0,0,.35)" cx="28" cy="21" r="1.4"/><path fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5" stroke-linecap="round" d="M20 25.5c1.6 1.4 6.4 1.4 8 0"/><path fill="#fff" d="M6 44c0-8.8 8.1-16 18-16s18 7.2 18 16v1H6v-1z"/></svg>`;
const AVATAR_ICON_GIRL = `<svg viewBox="0 0 48 48" width="66%" height="66%" style="display:block"><path fill="#fff" d="M24 6c-7 0-12.5 5.6-12.5 12.5 0 1.7.3 3.3 1 4.7.6-1.8 1.8-3.3 3.3-4.2-.3 1.6-.1 3.3.7 4.6-.7-2.1-.4-4.5.9-6.2 1.8 1.7 4.6 1.7 6.6 0 1.3 1.7 1.6 4.1.9 6.2.8-1.3 1-3 .7-4.6 1.5.9 2.7 2.4 3.3 4.2.7-1.4 1-3 1-4.7C36.5 11.6 31 6 24 6z"/><circle fill="#fff" cx="24" cy="21" r="9.5"/><ellipse fill="#fff" cx="9.5" cy="25" rx="2.6" ry="5.8"/><ellipse fill="#fff" cx="38.5" cy="25" rx="2.6" ry="5.8"/><circle fill="rgba(0,0,0,.35)" cx="20" cy="21" r="1.4"/><circle fill="rgba(0,0,0,.35)" cx="28" cy="21" r="1.4"/><path fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5" stroke-linecap="round" d="M20 25.5c1.6 1.4 6.4 1.4 8 0"/><path fill="#fff" d="M6 44c0-8.8 8.1-16 18-16s18 7.2 18 16v1H6v-1z"/></svg>`;

/** Fill for a student's avatar circle: their photo if set, else a flat
 *  boy/girl icon based on gender, else the first letter of their name.
 *  Caller supplies the colored circle container — this just returns the
 *  inner HTML. */
window.avatarContent = function(s) {
  if (s && s.photo_url) {
    return `<img src="${esc(s.photo_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">`;
  }
  const g = ((s && s.gender) || '').trim().toUpperCase();
  if (g === 'M') return AVATAR_ICON_BOY;
  if (g === 'F') return AVATAR_ICON_GIRL;
  return esc(((s && (s.name_en || s.name_local)) || '?')[0] || '?');
};
/** Return the list of grade names the school uses. */
window.getGradeList = function() {
  const cfg = (window.APP.config || {});
  if (Array.isArray(cfg.grades) && cfg.grades.length) {
    return cfg.grades.slice();
  }
  const set = new Set(
    (window.APP.students || [])
      .map(s => s.grade)
      .filter(Boolean)
  );
  return [...set].sort();
};
/* ─── Subjects (shared by Homework + Grades — single source of truth) ──── */

window._ensureSubjectsLoaded = async function(force = false) {
  if (!force && window.APP.subjectsCache && window.APP.subjectsCache.length) {
    return window.APP.subjectsCache;
  }
  try {
    window.APP.subjectsCache = await API.getSubjects();
  } catch (e) {
    window.APP.subjectsCache = window.APP.subjectsCache || [];
  }
  return window.APP.subjectsCache;
};

window.openAddSubjectPrompt = function(onAdded) {
  window._pendingSubjectAddCallback = onAdded || null;
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()" style="max-width:340px">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('subject.add')}</h3>
      <input class="form-input" id="newSubjectInput" placeholder="${esc(t('subject.ph'))}" autofocus>
      <button class="btn-primary mt16" id="addSubjectBtn" onclick="_confirmAddSubject()">${t('common.add')}</button>
      <button class="btn-secondary mt8" onclick="closeModal()">${t('common.cancel')}</button>
    </div>
  `);
};

window._confirmAddSubject = async function() {
  const input = document.getElementById('newSubjectInput');
  const name = (input?.value || '').trim();
  if (!name) { showToast(t('subject.enter')); return; }

  const btn = document.getElementById('addSubjectBtn');
  btn.disabled = true; btn.textContent = t('subject.adding');
  try {
    const res = await API.addSubject(name, null, null);
    await _ensureSubjectsLoaded(true);
    closeModal();
    showToast(t('subject.added'));
    if (typeof window._pendingSubjectAddCallback === 'function') {
      window._pendingSubjectAddCallback(res.subject);
    }
    window._pendingSubjectAddCallback = null;
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Add';
    showToast(e.duplicate ? 'That subject already exists' : 'Failed: ' + (e.message || 'error'));
  }
};
