// ═══════════════════════════════════════════════════════════
// SCMS i18n Engine — ဘာသာစကား စီမံခန့်ခွဲမှု
// File: js/00c_i18n.js
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
// PART 1 — I18N Engine
// ───────────────────────────────────────────────────────────
// ── Registered languages ──
// To add a language later: (1) create js/00x_locales_xx.js exporting
// `window.I18N_XX = { 'key': 'translation', ... }` with the same keys as
// I18N_EN, (2) load that script in index.html next to the other locale
// files, (3) add one line below. Nothing else in this engine, and none of
// the app's t('...') call sites, need to change — the language-switch
// button, browser-language detection, and <html lang> all read this list.
const LANGUAGES = [
  { code: 'en', label: 'EN',     name: 'English',            dict: () => window.I18N_EN },
  { code: 'my', label: 'မြန်မာ', name: 'Myanmar (Burmese)',  dict: () => window.I18N_MY },
];

const I18N = {
  current: 'en',           // default language
  fallback: 'en',
  storageKey: 'scms_lang', // localStorage key
  languages: LANGUAGES,

  // ── Available locales — built from LANGUAGES, one entry per registered code ──
  locales: Object.fromEntries(LANGUAGES.map(l => [l.code, () => l.dict() || {}])),

  // ── Init: localStorage + Telegram + browser lang ဖတ် ──
  init() {
    const saved = localStorage.getItem(this.storageKey);
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    const browserTag = (navigator.language || '').toLowerCase();
    // Match the browser's language against whichever languages are actually registered,
    // instead of a hardcoded my/en check — a newly-added language is picked up for free.
    const registered = LANGUAGES.map(l => l.code);
    const browserLang = registered.find(c => browserTag === c || browserTag.startsWith(c + '-'));

    this.current = (saved && registered.includes(saved) && saved)
      || (registered.includes(tgLang) && tgLang)
      || browserLang
      || this.fallback;
    this.apply();
  },

  // ── Translation lookup ──
  // t('btn.save') → 'Save' (or 'သိမ်းရန်')
  // t('msg.count', { n: 5 }) → variable interpolation
  t(key, vars) {
    const dict = this.locales[this.current]?.() || {};
    const fallbackDict = this.locales[this.fallback]?.() || {};
    let text = dict[key] ?? fallbackDict[key] ?? key;

    if (vars) {
      Object.keys(vars).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
      });
    }
    return text;
  },

  has(key) {
    const d = this.locales[this.current]?.() || {};
    const fb = this.locales[this.fallback]?.() || {};
    return Object.prototype.hasOwnProperty.call(d, key) || Object.prototype.hasOwnProperty.call(fb, key);
  },

  // Display label for a stored value (meal, mood, incident type …). The DB always keeps
  // the English value; unknown / school-defined values are shown as-is.
  tv(group, value) {
    const key = 'enum.' + group + '.' + value;
    return this.has(key) ? this.t(key) : (value == null ? '' : String(value));
  },

  // BCP-47 tag for Intl / toLocaleDateString, following the UI language
  // Weekday / month names stay English in both languages (that is what Myanmar users read on calendars)
  dateLocale() { return 'en-US'; },

  // ── ဘာသာစကား ပြောင်း ──
  setLang(lang) {
    if (!this.locales[lang]) {
      console.warn('[i18n] Unknown language:', lang);
      return;
    }
    this.current = lang;
    localStorage.setItem(this.storageKey, lang);
    this.apply();

    // Custom event — တခြား module တွေ နားထောင်နိုင်ဖို့
    window.dispatchEvent(new CustomEvent('languageChanged', {
      detail: { lang }
    }));
  },

  // ── HTML ထဲက [data-i18n] အားလုံးကို apply ──
  apply(root = document) {
    // 1. Text content
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });

    // 1b. Rich text (allows <em>/<b> in the translation — strings are ours, never user input)
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = this.t(el.getAttribute('data-i18n-html'));
    });

    // 2. Placeholder
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', this.t(key));
    });

    // 3. Title attribute (tooltip)
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.setAttribute('title', this.t(key));
    });

    // 4. aria-label
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      el.setAttribute('aria-label', this.t(key));
    });

    // 5. <html lang="..."> update
    document.documentElement.lang = this.current;

    // 6. Language switch button ရဲ့ label/"no flag" ကို update
    const label = document.getElementById('langLabel');
    if (label) label.textContent = LANGUAGES.find(l => l.code === this.current)?.label || this.current.toUpperCase();
    
  },
};

// Global export
window.I18N = I18N;
window.t = (key, vars) => I18N.t(key, vars);
window.LANGUAGES = LANGUAGES;
window.tv = (group, value) => I18N.tv(group, value);


// ───────────────────────────────────────────────────────────
// PART 2 — Language Switch UI Wiring
// ───────────────────────────────────────────────────────────
(function initI18n() {
  // i18n engine ကို initialize (localStorage + Telegram lang ဖတ်)
  I18N.init();

  // Language switch button ကို ချိတ်ဆက်
  function wireSwitch() {
    const switchBtn = document.getElementById('langSwitch');
    if (!switchBtn) {
      console.warn('[i18n] #langSwitch button not found');
      return;
    }
    switchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Cycle to the next registered language (wraps around) — works for any number of languages.
      const codes = LANGUAGES.map(l => l.code);
      const next = codes[(codes.indexOf(I18N.current) + 1) % codes.length];
      I18N.setLang(next);
    });
  }

  // DOM ပြီးပြီးချင်း wire လုပ်
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSwitch);
  } else {
    wireSwitch();
  }
})();
