/** SCMS v12 — 02H_api_communication.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async sendParentComm(data) {
      if (window.APP.platform === 'web') return _webRpc('rpc_send_parent_comm', {
        p_session_token: _webSessionToken(),
        p_student_id: data.student_id, p_name_en: data.name_en, p_class: data.class,
        p_type: data.type, p_message_preview: data.message_preview, p_date: data.date,
      });
      return twaPost('send_parent_comm', {
        ...data,
        school_id:  window.APP.school_id,
        teacher_id: window.APP.teacher_id,
      });
    },
  
  async createParentPortalEvent(data) {
      return _webRpc('rpc_parent_portal_event_create', {
        p_session_token: _webSessionToken(),
        p_class: data.class || null,
        p_student_id: data.student_id || null,
        p_event_type: data.event_type || 'announcement',
        p_title: data.title,
        p_description: data.description || null,
        p_starts_at: data.starts_at,
        p_ends_at: data.ends_at || null,
      });
    },

  async deleteParentPortalEvent(id) {
      return _webRpc('rpc_parent_portal_event_delete', {
        p_session_token: _webSessionToken(), p_id: id,
      });
    },

  async updateParentComm(id, patch) {
      return twaPost('update_parent_comm', { id, patch });
    },
  
  async deleteParentComm(id) {
      if (window.APP.platform === 'web') return _webRpc('rpc_delete_parent_comm', {
        p_session_token: _webSessionToken(), p_id: id,
      });
      return twaPost('delete_parent_comm', { id });
    },
  
  async getParentComms(daysBack = 30) {
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_parent_comms', {
          p_session_token: _webSessionToken(), p_days_back: daysBack,
        });
        return res.rows;
      }
      const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
      return sbQuery('parent_comms',
        `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc`);
    },
  
    // ─── TIMETABLE ───────────────────────────────────────────────────────────
});
window.API = API;
