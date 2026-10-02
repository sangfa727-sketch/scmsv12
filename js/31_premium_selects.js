/* SCMS v12 — premium data-entry select controls
 * Replaces the browser-owned dropdown popup with an in-app, keyboard-accessible
 * listbox while keeping the original <select> as the form/state source of truth.
 */
(function () {
  'use strict';
  const SELECTOR = '#pages select:not(.attend-class-select):not(.lang-switch), .modal-sheet select:not(.attend-class-select):not(.lang-switch)';
  const WRAP_CLASS = 'scms-select-wrap';
  let openWrap = null, raf = 0;

  function shouldEnhance(select) {
    return select && !select.dataset.scmsSelectEnhanced &&
      !select.closest('.lang-picker') && !select.closest('.form-picker-trigger');
  }
  function close(wrap) {
    if (!wrap) return;
    const menu = wrap.querySelector('.scms-select-menu');
    const trigger = wrap.querySelector('.scms-select-trigger');
    if (menu) menu.classList.remove('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (openWrap === wrap) openWrap = null;
  }
  function closeAll(except) {
    document.querySelectorAll('.scms-select-wrap').forEach(w => { if (w !== except) close(w); });
  }
  function syncPosition(wrap) {
    const trigger = wrap.querySelector('.scms-select-trigger'), menu = wrap.querySelector('.scms-select-menu');
    if (!trigger || !menu || !menu.classList.contains('is-open')) return;
    const r = trigger.getBoundingClientRect(), gap = 6, pad = 8;
    const width = Math.max(r.width, 180), maxH = Math.min(300, window.innerHeight - pad * 2);
    const below = window.innerHeight - r.bottom - pad, height = Math.min(menu.scrollHeight || maxH, maxH);
    const up = below < Math.min(220, height) && r.top > below;
    menu.style.minWidth = width + 'px';
    menu.style.maxHeight = maxH + 'px';
    menu.style.left = Math.max(pad, Math.min(r.left, window.innerWidth - width - pad)) + 'px';
    menu.style.top = (up ? Math.max(pad, r.top - height - gap) : Math.min(window.innerHeight - pad - height, r.bottom + gap)) + 'px';
  }
  function updateValue(wrap, focusSelected) {
    const select = wrap.querySelector('select'), value = wrap.querySelector('.scms-select-value'), menu = wrap.querySelector('.scms-select-menu');
    if (!select || !value) return;
    const option = select.options[select.selectedIndex];
    value.textContent = option ? option.textContent.trim() : '';
    value.classList.toggle('is-placeholder', !option || option.value === '');
    if (menu) {
      menu.querySelectorAll('[role="option"]').forEach(row => {
        const selected = row.dataset.index === String(select.selectedIndex);
        row.setAttribute('aria-selected', selected ? 'true' : 'false');
        row.classList.toggle('is-selected', selected);
        row.tabIndex = selected ? 0 : -1;
      });
      if (focusSelected) menu.querySelector('[role="option"][aria-selected="true"]')?.focus();
    }
  }
  function renderMenu(wrap) {
    const select = wrap.querySelector('select'), menu = wrap.querySelector('.scms-select-menu');
    if (!select || !menu) return;
    menu.replaceChildren();
    Array.from(select.options).forEach((item, index) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'scms-select-option';
      row.setAttribute('role', 'option'); row.dataset.index = String(index);
      row.setAttribute('aria-selected', item.selected ? 'true' : 'false');
      row.disabled = item.disabled; row.tabIndex = item.selected ? 0 : -1;
      const label = document.createElement('span');
      label.className = 'scms-select-option-label'; label.textContent = item.textContent.trim() || '—';
      const check = document.createElement('span');
      check.className = 'scms-select-option-check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓';
      row.append(label, check);
      row.addEventListener('click', () => {
        if (item.disabled) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        updateValue(wrap, false); close(wrap); wrap.querySelector('.scms-select-trigger')?.focus();
      });
      menu.appendChild(row);
    });
  }
  function open(wrap) {
    const trigger = wrap.querySelector('.scms-select-trigger'), menu = wrap.querySelector('.scms-select-menu'), select = wrap.querySelector('select');
    if (!trigger || !menu || !select || select.disabled) return;
    closeAll(wrap); renderMenu(wrap); menu.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true'); openWrap = wrap; syncPosition(wrap);
    menu.querySelector('[role="option"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function enhance(select) {
    if (!shouldEnhance(select)) return;
    const parent = select.parentElement, wrap = document.createElement('div');
    wrap.className = WRAP_CLASS; select.dataset.scmsSelectEnhanced = 'true';
    select.setAttribute('aria-hidden', 'true'); select.tabIndex = -1;
    parent.insertBefore(wrap, select); wrap.appendChild(select);
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'scms-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    const id = 'scms-select-menu-' + Math.random().toString(36).slice(2);
    trigger.setAttribute('aria-controls', id); trigger.disabled = select.disabled;
    const value = document.createElement('span'); value.className = 'scms-select-value';
    const chevron = document.createElement('span'); chevron.className = 'scms-select-chevron';
    chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '⌄';
    trigger.append(value, chevron);
    const menu = document.createElement('div'); menu.className = 'scms-select-menu'; menu.id = id; menu.setAttribute('role', 'listbox');
    wrap.append(trigger, menu);
    trigger.addEventListener('click', () => menu.classList.contains('is-open') ? close(wrap) : open(wrap));
    trigger.addEventListener('keydown', e => {
      if (['ArrowDown','ArrowUp','Enter',' '].includes(e.key)) { e.preventDefault(); open(wrap); }
    });
    select.addEventListener('change', () => { updateValue(wrap, false); trigger.disabled = select.disabled; });
    updateValue(wrap, false);
  }
  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(SELECTOR).forEach(enhance);
    if (scope.matches?.('select')) enhance(scope);
  }
  function scheduleScan() {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => scan(document));
  }
  document.addEventListener('click', e => { if (!e.target.closest('.scms-select-wrap')) closeAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  window.addEventListener('resize', () => openWrap && syncPosition(openWrap), { passive: true });
  window.addEventListener('scroll', () => openWrap && syncPosition(openWrap), { passive: true, capture: true });
  const observer = new MutationObserver(scheduleScan);
  function init() { scan(document); observer.observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.SCMSPremiumSelects = Object.freeze({ scan });
})();
