/**
 * SCMS — Theme controller
 * Keeps theme selection isolated from component styling so future themes
 * (Glass, Neumorphism, Material You, etc.) can be added without rewriting UI.
 */
'use strict';

(() => {
  const KEY = 'scms_theme';
  const THEMES = new Set(['light', 'dark']);

  function normalize(value) {
    return THEMES.has(value) ? value : null;
  }
  function stored() {
    try { return normalize(localStorage.getItem(KEY)); } catch (_) { return null; }
  }
  function apply(theme, persist = true) {
    const value = normalize(theme) || 'light';
    document.documentElement.setAttribute('data-theme', value);
    document.documentElement.style.colorScheme = value;
    if (persist) {
      try { localStorage.setItem(KEY, value); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: value } }));
    return value;
  }
  function current() {
    return normalize(document.documentElement.getAttribute('data-theme')) || 'light';
  }
  function set(theme) { return apply(theme, true); }
  function init() {
    const saved = stored();
    if (saved) apply(saved, false);
    else apply('light', false);
  }
  function syncExternal(scheme) {
    if (!stored() && normalize(scheme)) apply(scheme, false);
  }

  window.SCMSTheme = Object.freeze({
    key: KEY,
    themes: ['light', 'dark'],
    current,
    set,
    init,
    syncExternal,
    hasUserPreference: () => !!stored(),
  });
  init();
})();
