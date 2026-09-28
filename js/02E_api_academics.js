/** SCMS v12 — 02E_api_academics.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async saveDailyReport(data) {
      const date = data.date || new Date().toISOString().slice(0, 10);
      if (window.APP.platform === 'web') return _webRpc('rpc_save_daily_report', {
        p_session_token: _webSessionToken(),
        p_student_id: data.student_id, p_name_en: data.name_en, p_class: data.class,
        p_date: date, p_meal: data.meal, p_nap_min: data.nap_min ?? null,
        p_mood: data.mood, p_behaviour_note: data.behaviour_note || null,
        p_toilet_ok: data.toilet_ok ?? null,
      });
      return twaPost('save_daily_report', { ...data, date });
    },
  
  async updateDailyReport(id, patch) {
      return twaPost('update_daily_report', { id, patch });
    },
  
  async deleteDailyReport(id) {
      return twaPost('delete_daily_report', { id });
    },
  
  async getDailyReports(daysBack = 7) {
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_daily_reports', {
          p_session_token: _webSessionToken(), p_days_back: daysBack,
        });
        return res.rows;
      }
      const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
      return sbQuery('daily_reports',
        `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc,name_en`);
    },
  
    // ─── HOMEWORK ────────────────────────────────────────────────────────────
  
  async saveHomework(data) {
      const date = data.date || new Date().toISOString().slice(0, 10);
      if (window.APP.platform === 'web') return _webRpc('rpc_save_homework', {
        p_session_token: _webSessionToken(),
        p_class: data.class, p_subject: data.subject, p_type: data.type,
        p_description: data.description, p_lb_page: data.lb_page || null,
        p_wb_page: data.wb_page || null, p_due_date: data.due_date || null,
        p_date: date,
      });
      return twaPost('save_homework', {
        ...data,
        date,
        school_id:  window.APP.school_id,
        teacher_id: window.APP.teacher_id,
      });
    },
  
  async updateHomework(id, patch) {
      if (window.APP.platform === 'web') return _webRpc('rpc_update_homework', {
        p_session_token: _webSessionToken(),
        p_id: id, p_subject: patch.subject, p_class: patch.class, p_type: patch.type,
        p_description: patch.description, p_lb_page: patch.lb_page || null,
        p_wb_page: patch.wb_page || null, p_due_date: patch.due_date || null,
      });
      return twaPost('update_homework', { id, patch });
    },
  
  async deleteHomework(id) {
      if (window.APP.platform === 'web') return _webRpc('rpc_delete_homework', {
        p_session_token: _webSessionToken(),
        p_id: id,
      });
      return twaPost('delete_homework', { id });
    },
  
  async getHomework(daysBack = 30) {
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_homework', {
          p_session_token: _webSessionToken(), p_days_back: daysBack,
        });
        return res.rows;
      }
      const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
      return sbQuery('homework_log',
        `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc`);
    },
  
    // ─── INCIDENTS ───────────────────────────────────────────────────────────
  
  async saveIncident(data) {
      if (window.APP.platform === 'web') return _webRpc('rpc_save_incident', {
        p_session_token: _webSessionToken(),
        p_student_id: data.student_id, p_name_en: data.name_en, p_class: data.class,
        p_type: data.type, p_severity: data.severity, p_description: data.description,
        p_action_taken: data.action_taken, p_parent_notified: !!data.parent_notified,
        p_date: data.date,
      });
      return twaPost('save_incident', {
        ...data,
        date: data.date || new Date().toISOString().slice(0, 10),
        school_id:  window.APP.school_id,
        teacher_id: window.APP.teacher_id,
      });
    },
  
  async updateIncident(id, patch) {
      if (window.APP.platform === 'web') return _webRpc('rpc_update_incident', {
        p_session_token: _webSessionToken(),
        p_id: id, p_type: patch.type, p_severity: patch.severity,
        p_description: patch.description, p_action_taken: patch.action_taken,
        p_parent_notified: !!patch.parent_notified,
      });
      return twaPost('update_incident', { id, patch });
    },
  
  async deleteIncident(id) {
      if (window.APP.platform === 'web') return _webRpc('rpc_delete_incident', {
        p_session_token: _webSessionToken(), p_id: id,
      });
      return twaPost('delete_incident', { id });
    },
  
  async getIncidents(daysBack = 30) {
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_incidents', {
          p_session_token: _webSessionToken(), p_days_back: daysBack,
        });
        return res.rows;
      }
      const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
      return sbQuery('incidents',
        `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc`);
    },
  
    // ─── LEAVE REQUESTS ──────────────────────────────────────────────────────
    // Manual approve/reject only — deliberately not wired to n8n/AI, since
    // that backend is not currently deployed. Approving auto-marks attendance
    // (handled server-side in rpc_decide_leave_request).
  
  async getLeaveRequests(status = null) {
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_leave_requests', {
          p_session_token: _webSessionToken(), p_status: status,
        });
        return res.rows;
      }
      return twaPost('get_leave_requests', { status });
    },
  
  async decideLeaveRequest(id, decision, teacherNote = null) {
      if (window.APP.platform === 'web') return _webRpc('rpc_decide_leave_request', {
        p_session_token: _webSessionToken(), p_id: id,
        p_decision: decision, p_teacher_note: teacherNote,
      });
      return twaPost('decide_leave_request', { id, decision, teacher_note: teacherNote });
    },
  
    // ─── PARENT COMMS ────────────────────────────────────────────────────────
  
  async saveTimetable(data) {
      if (window.APP.platform === 'web') return _webRpc('rpc_save_timetable', {
        p_session_token: _webSessionToken(),
        p_day: data.day, p_period: data.period, p_start_time: data.start_time,
        p_class: data.class, p_subject: data.subject, p_room: data.room,
      });
      return twaPost('save_timetable', {
        ...data,
        school_id:  window.APP.school_id,
      });
    },
  
  async updateTimetable(id, patch) {
      if (window.APP.platform === 'web') return _webRpc('rpc_update_timetable', {
        p_session_token: _webSessionToken(),
        p_id: id, p_day: patch.day, p_period: patch.period, p_start_time: patch.start_time,
        p_class: patch.class, p_subject: patch.subject, p_room: patch.room,
      });
      return twaPost('update_timetable', { id, patch });
    },
  
  async deleteTimetable(id) {
      if (window.APP.platform === 'web') return _webRpc('rpc_delete_timetable', {
        p_session_token: _webSessionToken(), p_id: id,
      });
      return twaPost('delete_timetable', { id });
    },
  
  async getTimetable() {
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_timetable', { p_session_token: _webSessionToken() });
        return res.rows;
      }
      return sbQuery('timetable',
        `school_id=eq.${window.APP.school_id}&order=day,period`);
    },
  
    // ─── MONTHLY SUMMARY ─────────────────────────────────────────────────────
  
  async getMonthlySummary(yearMonth) {
      const ym = yearMonth || new Date().toISOString().slice(0, 7);
      if (window.APP.platform === 'web') {
        const res = await _webRpc('rpc_get_monthly_summary', {
          p_session_token: _webSessionToken(), p_year_month: ym,
        });
        return res.rows;
      }
      return sbQuery('monthly_summary',
        `school_id=eq.${window.APP.school_id}&year_month=eq.${ym}&order=class,name_en`);
    },
  
    // ─── SCHOOL CONFIG ───────────────────────────────────────────────────────
  
  async getSubjects() {
      const res = await _webRpc('rpc_get_subjects', { p_session_token: _webSessionToken() });
      return res.rows;
    },
  
  async addSubject(name, code, color) {
      return _webRpc('rpc_add_subject', {
        p_session_token: _webSessionToken(),
        p_subject_name: name, p_subject_code: code || null, p_subject_color: color || null,
      });
    },
  
  async getTerms() {
      const res = await _webRpc('rpc_get_terms', { p_session_token: _webSessionToken() });
      return res.rows;
    },
  
  async addTerm(data) {
      return _webRpc('rpc_add_term', {
        p_session_token:  _webSessionToken(),
        p_academic_year:  data.academic_year || null,
        p_term_name:      data.term_name,
        p_term_order:     data.term_order || null,
        p_start_date:     data.start_date || null,
        p_end_date:       data.end_date || null,
        p_is_current:     !!data.is_current,
      });
    },
  
  async getAssessments(filters = {}) {
      const res = await _webRpc('rpc_get_assessments', {
        p_session_token: _webSessionToken(),
        p_class:      filters.class || null,
        p_subject_id: filters.subject_id || null,
        p_term_id:    filters.term_id || null,
      });
      return res.rows;
    },
  
  async createAssessment(data) {
      return _webRpc('rpc_create_assessment', {
        p_session_token: _webSessionToken(),
        p_term_id:    data.term_id || null,
        p_subject_id: data.subject_id || null,
        p_class:      data.class,
        p_title:      data.title,
        p_type:       data.type,
        p_max_score:  data.max_score,
        p_weight:     data.weight,
        p_date:       data.date,
        p_start_time: data.start_time || null,
        p_end_time:   data.end_time || null,
        p_start_time: data.start_time || null,
        p_end_time:   data.end_time || null,
      });
    },
  
  async deleteAssessment(id) {
      return _webRpc('rpc_delete_assessment', {
        p_session_token: _webSessionToken(),
        p_id: id,
      });
    },
  
  async getGrades(assessmentId) {
      const res = await _webRpc('rpc_get_grades', {
        p_session_token: _webSessionToken(),
        p_assessment_id: assessmentId,
      });
      return res.rows;
    },
  
  async saveGrades(assessmentId, records) {
      return _webRpc('rpc_save_grades', {
        p_session_token: _webSessionToken(),
        p_assessment_id: assessmentId,
        p_records:       records,
      });
    },
  
  async getReportCard(termId, cls) {
      return _webRpc('rpc_get_report_card', {
        p_session_token: _webSessionToken(),
        p_term_id: termId,
        p_class: cls,
      });
    },
    // ─── FEE / BILLING (web only for now — new feature, not on n8n) ──────────
});
window.API = API;
