/** SCMS v12 — 02D_api_attendance.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async saveAttendance(cls, date, records) {
      if (window.APP.platform === 'web') return _webRpc('rpc_save_attendance', {
        p_session_token: getWebSession()?.session_token,
        p_class: cls, p_date: date, p_records: records,
      });
      return twaPost('save_attendance', { class: cls, date, records });
    },
  
  async getAttendance(daysBack = 30) {
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_attendance', {
          p_session_token: getWebSession()?.session_token, p_days_back: daysBack,
        });
        return res.rows;
      }
      const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
      return sbQuery('attendance',
        `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc,class`);
    },
  
    // ─── STUDENTS ────────────────────────────────────────────────────────────
});
window.API = API;
