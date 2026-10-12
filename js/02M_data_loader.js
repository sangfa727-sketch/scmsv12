/**
 * SCMS v12 — shared web data loading
 *
 * Keeps network loading out of APPStore and out of _webRpc().
 * Provides cache + in-flight Promise dedupe for page/dashboard data.
 */
'use strict';

(function () {
  const cache = new Map();
  const inflight = new Map();

  const specs = {
    students:       { load: () => API.getStudents(), assign: v => { window.APP.students = v || []; } },
    attendance:     { load: () => API.getAttendance(30), assign: v => { window.APP.attendance = v || []; } },
    dailyReports:   { load: () => API.getDailyReports(7), assign: v => { window.APP.dailyReports = v || []; } },
    homework:       { load: () => API.getHomework(30), assign: v => { window.APP.homework = v || []; } },
    parentComms:    { load: () => API.getParentComms(30), assign: v => { window.APP.parentComms = v || []; } },
    incidents:      { load: () => API.getIncidents(30), assign: v => { window.APP.incidents = v || []; } },
    timetable:      { load: () => API.getTimetable(), assign: v => { window.APP.timetable = v || []; } },
    monthlySummary: { load: () => API.getMonthlySummary(), assign: v => { window.APP.monthlySummary = v || []; } },
  };

  // Cache identity must follow the authenticated tenant and user, not only
  // the resource name. A login can switch schools without a full page reload.
  let cacheTenantKey = null;

  function _tenantKey() {
    const app = window.APP || {};
    const saved = typeof window.getWebSession === 'function' ? window.getWebSession() : null;
    const sessionToken = saved?.session_token || app.webSession?.session_token || '';
    return [
      app.school_id || '',
      app.teacher_id || '',
      app.teacher_role || '',
      sessionToken,
    ].map(value => String(value)).join('::');
  }

  function _syncTenant() {
    const tenantKey = _tenantKey();
    if (tenantKey !== cacheTenantKey) {
      cache.clear();
      inflight.clear();
      cacheTenantKey = tenantKey;
    }
    return tenantKey;
  }

  function _key(name, tenantKey = _syncTenant()) {
    return tenantKey + '::' + name;
  }

  async function load(name, { force = false } = {}) {
    const spec = specs[name];
    if (!spec) throw new Error('Unknown data resource: ' + name);

    const tenantKey = _syncTenant();
    const key = _key(name, tenantKey);
    if (!force && cache.has(key)) return cache.get(key);
    if (!force && inflight.has(key)) return inflight.get(key);

    let promise;
    promise = Promise.resolve()
      .then(() => _tenantKey() === tenantKey ? spec.load() : [])
      .then(rows => {
        // A previous tenant's slow request must never overwrite the active
        // tenant's in-memory APP state after an account/school switch.
        if (_tenantKey() !== tenantKey) return [];
        const value = Array.isArray(rows) ? rows : [];
        cache.set(key, value);
        spec.assign(value);
        return value;
      })
      .finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  }

  function invalidate(names) {
    const list = names == null ? Object.keys(specs) : (Array.isArray(names) ? names : [names]);
    list.forEach(name => cache.delete(_key(name)));
  }

  function clear() {
    cache.clear();
    inflight.clear();
  }

  async function ensurePageData(pageId) {
    if (window.APP?.platform !== 'web') return;

    const pages = {
      students: ['students'],
      attend: ['students', 'attendance'],
      daily: ['students', 'dailyReports'],
      hw: ['students', 'homework'],
      parents: ['students', 'parentComms'],
      incidents: ['students', 'incidents'],
      timetable: ['students', 'timetable'],
      summary: ['monthlySummary'],
      insights: ['students', 'monthlySummary'],
    };
    const names = pages[pageId];
    if (!names) return;
    await Promise.all(names.map(name => load(name)));
  }

  async function loadDashboardData() {
    const tenantKey = _syncTenant();
    const names = ['dashboard:timetable', 'dashboard:attendance', 'dashboard:homework', 'dashboard:incidents', 'dashboard:comms', 'dashboard:leave'];
    const loaders = {
      'dashboard:timetable': () => API.getTimetable(),
      'dashboard:attendance': () => API.getAttendance(14),
      'dashboard:homework': () => API.getHomework(14),
      'dashboard:incidents': () => API.getIncidents(14),
      'dashboard:comms': () => API.getParentComms(14),
      'dashboard:leave': () => API.getLeaveRequests(),
    };
    const values = await Promise.all(names.map(name => {
      const key = _key(name, tenantKey);
      if (inflight.has(key)) return inflight.get(key);
      let promise;
      promise = Promise.resolve()
        .then(() => _tenantKey() === tenantKey ? loaders[name]() : [])
        .then(value => _tenantKey() === tenantKey && Array.isArray(value) ? value : [])
        .finally(() => {
          if (inflight.get(key) === promise) inflight.delete(key);
        });
      inflight.set(key, promise);
      return promise;
    }));

    // If the account changed while dashboard requests were running, discard
    // the whole stale snapshot instead of returning data from the old school.
    if (_tenantKey() !== tenantKey) {
      return { timetable: [], attendance: [], homework: [], incidents: [], comms: [], leaveRequests: [] };
    }
    return {
      timetable: values[0],
      attendance: values[1],
      homework: values[2],
      incidents: values[3],
      comms: values[4],
      leaveRequests: values[5],
    };
  }

  async function refreshAll() {
    const names = Object.keys(specs);
    invalidate(names);
    const results = await Promise.allSettled(names.map(name => load(name, { force: true })));
    return results;
  }

  window.SCMSDataLoader = { load, loadDashboardData, invalidate, clear, ensurePageData, refreshAll };

  Object.assign(window.API, {
    loadData: load,
    invalidateDataCache: invalidate,
    ensurePageData,
    refreshAllData: refreshAll,
  });
})();
