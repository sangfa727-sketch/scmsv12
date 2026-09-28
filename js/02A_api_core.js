/**
 * SCMS v12 — API shared infrastructure
 *
 * Only cross-domain transport/helpers belong here.
 */

'use strict';

/** Direct PostgREST RPC helper used by web-session API modules. */
async function _webRpc(fnName, params) {
  const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SCMS_CONFIG.SUPABASE_ANON,
      Authorization: `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
  }

  const result = await resp.json();
  if (!result || !result.ok) {
    const err = new Error(result?.message || result?.error || `${fnName} failed`);
    Object.assign(err, result || {});
    throw err;
  }

  return result;
}

/** Resize/compress a picked image to a small JPEG. */
async function _prepStudentPhoto(file) {
  try {
    return await _brandImageToBlob(file, {
      maxW: 640,
      maxH: 640,
      crop: true,
      keepAlpha: false,
    });
  } catch (e) {
    throw new Error('Could not read that image — please choose a JPG or PNG');
  }
}

const API = window.API || {};
window.API = API;

Object.assign(API, {

  async refreshAll() {
    const [students, attendance, dailyReports, homework, parentComms, incidents, timetable, pendingLeave] =
      await Promise.allSettled([
        API.getStudents(),
        API.getAttendance(30),
        API.getDailyReports(30),
        API.getHomework(30),
        API.getParentComms(30),
        API.getIncidents(30),
        API.getTimetable(),
        API.getLeaveRequests('Pending'),
      ]);

    if (students.status     === 'fulfilled') window.APP.students     = students.value     || [];
    if (attendance.status   === 'fulfilled') window.APP.attendance   = attendance.value   || [];
    if (dailyReports.status === 'fulfilled') window.APP.dailyReports = dailyReports.value || [];
    if (homework.status     === 'fulfilled') window.APP.homework     = homework.value     || [];
    if (parentComms.status  === 'fulfilled') window.APP.parentComms  = parentComms.value  || [];
    if (incidents.status    === 'fulfilled') window.APP.incidents    = incidents.value    || [];
    if (timetable.status    === 'fulfilled') window.APP.timetable    = timetable.value    || [];
    // Sidebar badge only — the Leave Requests page itself always re-fetches
    // its own full list, this is just so the count shows before you visit it.
    window.APP.pendingLeaveCount = pendingLeave.status === 'fulfilled' ? (pendingLeave.value?.length || 0) : 0;

    return window.APP;
  },

  async updateSchoolConfig(patch) {
    if (window.APP.platform === 'web') return _webRpc('rpc_update_school_config_web', {
      p_session_token: getWebSession()?.session_token,
      p_patch: patch,
    });
    return twaPost('update_school_config', { patch });
  },

    // ─── GRADING & ASSESSMENT (web only for now — new feature, not on n8n) ────,

  async setMyUiPrefs(patch) {
    return _webRpc('rpc_set_my_ui_prefs', {
      p_session_token: getWebSession()?.session_token,
      p_patch: patch,
    });
  },

  /** Sets the CURRENT teacher's own profile photo. */

});

window.API = API;
