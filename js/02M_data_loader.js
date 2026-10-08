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

  function _key(name) {
    return name;
  }

  async function load(name, { force = false } = {}) {
    const spec = specs[name];
    if (!spec) throw new Error('Unknown data resource: ' + name);

    const key = _key(name);
    if (!force && cache.has(key)) return cache.get(key);
    if (!force && inflight.has(key)) return inflight.get(key);

    const promise = Promise.resolve()
      .then(spec.load)
      .then(rows => {
        const value = Array.isArray(rows) ? rows : [];
        cache.set(key, value);
        spec.assign(value);
        return value;
      })
      .finally(() => inflight.delete(key));

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
      if (inflight.has(name)) return inflight.get(name);
      const promise = Promise.resolve().then(loaders[name]).then(v => Array.isArray(v) ? v : []).finally(() => inflight.delete(name));
      inflight.set(name, promise);
      return promise;
    }));
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
