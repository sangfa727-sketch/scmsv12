/**
 * SCMS v12 — Central application state store.
 *
 * Small state boundary for the existing global APP architecture.
 * New code should use APPStore instead of creating new mutable globals.
 */
'use strict';

(function initSCMSStore(root) {
  if (root.APPStore) return;

  const listeners = new Set();
  const state = {
    session: { ready: false, sessionToken: null, authMode: null },
    tenant: { schoolId: '', teacherId: '', role: '', isAdmin: false },
    data: {},
    ui: { currentPage: 'dashboard', sidebarOpen: false },
    flags: {},
  };

  const clone = (value) => {
    if (value === undefined || value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  function read() { return clone(state); }

  function get(path) {
    if (!path) return read();
    return path.split('.').reduce((acc, key) => acc == null ? undefined : acc[key], state);
  }

  function notify(changedPaths) {
    const snapshot = read();
    listeners.forEach((listener) => {
      try { listener(snapshot, changedPaths); }
      catch (err) { console.error('[APPStore] subscriber failed:', err); }
    });
  }

  function patch(section, value) {
    if (!Object.prototype.hasOwnProperty.call(state, section)) {
      throw new Error('Unknown state section: ' + section);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('State patch must be an object');
    }
    Object.assign(state[section], clone(value));
    notify([section]);
    return get(section);
  }

  function set(path, value) {
    const parts = path.split('.').filter(Boolean);
    if (!parts.length) throw new Error('State path is required');
    let cursor = state;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (!Object.prototype.hasOwnProperty.call(cursor, key) ||
          cursor[key] === null || typeof cursor[key] !== 'object') cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = clone(value);
    notify([path]);
    return clone(value);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function reset(section) {
    const defaults = {
      session: { ready: false, sessionToken: null, authMode: null },
      tenant: { schoolId: '', teacherId: '', role: '', isAdmin: false },
      data: {}, ui: { currentPage: 'dashboard', sidebarOpen: false }, flags: {},
    };
    if (section) {
      if (!Object.prototype.hasOwnProperty.call(state, section)) {
        throw new Error('Unknown state section: ' + section);
      }
      state[section] = clone(defaults[section]);
      notify([section]);
      return;
    }
    Object.assign(state, clone(defaults));
    notify(['*']);
  }

  root.APPStore = Object.freeze({ read, get, patch, set, subscribe, reset });
})(window);
