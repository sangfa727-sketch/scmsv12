const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'js', '02M_data_loader.js'), 'utf8');

function createHarness() {
  const window = {
    APP: {
      platform: 'web',
      school_id: 'school-A',
      teacher_id: 'teacher-A',
      teacher_role: 'admin',
      webSession: { session_token: 'session-A' },
    },
    getWebSession() {
      return { session_token: this.APP.webSession?.session_token || '' };
    },
  };
  const calls = [];
  let resolveSchoolA;
  const API = {
    getStudents() {
      const schoolId = window.APP.school_id;
      calls.push(schoolId);
      if (schoolId === 'school-A' && createHarness.deferSchoolA) {
        return new Promise(resolve => { resolveSchoolA = resolve; });
      }
      return Promise.resolve([{ school_id: schoolId, student_id: schoolId + '-student' }]);
    },
    getAttendance: async () => [],
    getDailyReports: async () => [],
    getHomework: async () => [],
    getParentComms: async () => [],
    getIncidents: async () => [],
    getTimetable: async () => [],
    getMonthlySummary: async () => [],
    getLeaveRequests: async () => [],
  };
  window.API = API;
  vm.runInNewContext(source, { window, API, Promise, Map, Object, Array, String, Number, Math });
  return {
    window,
    calls,
    API,
    resolveSchoolA: value => resolveSchoolA(value),
    switchToSchoolB() {
      window.APP.school_id = 'school-B';
      window.APP.teacher_id = 'teacher-B';
      window.APP.teacher_role = 'admin';
      window.APP.webSession = { session_token: 'session-B' };
    },
  };
}

test('data cache is isolated when the signed-in school and teacher change', async () => {
  const h = createHarness();
  const first = await h.window.SCMSDataLoader.load('students');
  assert.equal(first[0].school_id, 'school-A');

  h.switchToSchoolB();
  const secondRequest = h.window.SCMSDataLoader.load('students');
  // Previous-school records must be removed synchronously on identity change,
  // before the new school's request has returned.
  assert.deepEqual(h.window.APP.students, []);
  const second = await secondRequest;

  assert.equal(second[0].school_id, 'school-B');
  assert.equal(h.window.APP.students[0].school_id, 'school-B');
  assert.deepEqual(h.calls, ['school-A', 'school-B']);
});

test('a slow response from the previous school cannot overwrite the active school state', async () => {
  createHarness.deferSchoolA = true;
  const h = createHarness();
  const oldRequest = h.window.SCMSDataLoader.load('students');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls, ['school-A']);

  h.switchToSchoolB();
  const newRows = await h.window.SCMSDataLoader.load('students');
  assert.equal(newRows[0].school_id, 'school-B');

  h.resolveSchoolA([{ school_id: 'school-A', student_id: 'school-A-student' }]);
  const staleRows = await oldRequest;

  assert.equal(staleRows.length, 0);
  assert.equal(h.window.APP.students[0].school_id, 'school-B');
  createHarness.deferSchoolA = false;
});

test('dashboard in-flight requests are scoped to the active tenant', async () => {
  const h = createHarness();
  let resolveA;
  h.API.getTimetable = () => h.window.APP.school_id === 'school-A'
    ? new Promise(resolve => { resolveA = resolve; })
    : Promise.resolve([{ school_id: h.window.APP.school_id }]);

  const oldDashboard = h.window.SCMSDataLoader.loadDashboardData();
  await new Promise(resolve => setImmediate(resolve));
  h.switchToSchoolB();

  const newDashboard = await h.window.SCMSDataLoader.loadDashboardData();
  assert.equal(newDashboard.timetable[0].school_id, 'school-B');

  resolveA([{ school_id: 'school-A' }]);
  const staleDashboard = await oldDashboard;
  assert.equal(staleDashboard.timetable.length, 0);
});

test('cache is invalidated when role or session changes within the same school', async () => {
  const h = createHarness();

  const first = await h.window.SCMSDataLoader.load('students');
  assert.equal(first[0].school_id, 'school-A');
  assert.equal(h.calls.length, 1);

  // Same school and teacher, but a role change must not reuse cached data.
  h.window.APP.teacher_role = 'teacher';
  const afterRoleChange = await h.window.SCMSDataLoader.load('students');
  assert.equal(afterRoleChange[0].school_id, 'school-A');
  assert.equal(h.calls.length, 2);

  // Same school, teacher, and role, but a new authenticated session must
  // also get a fresh request rather than reusing the previous session cache.
  h.window.APP.webSession = { session_token: 'session-A-renewed' };
  const afterSessionChange = await h.window.SCMSDataLoader.load('students');
  assert.equal(afterSessionChange[0].school_id, 'school-A');
  assert.equal(h.calls.length, 3);
});
